(() => {
const utf8Encoder = new TextEncoder();

function toBytes(text) {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string');
  }
  return utf8Encoder.encode(text);
}

function paddedBits(bits) {
  return Math.ceil(bits / 8) * 8;
}

function buildHuffmanCodes(data) {
  if (data.length === 0) return { codes: new Map(), treeBits: 0 };

  const frequencies = new Map();
  for (const byte of data) frequencies.set(byte, (frequencies.get(byte) || 0) + 1);

  let order = 0;
  const heap = Array.from(frequencies, ([symbol, frequency]) => ({
    symbol, frequency, order: order++, left: null, right: null,
  }));
  const compare = (a, b) => a.frequency - b.frequency || a.order - b.order;
  heap.sort(compare);

  while (heap.length > 1) {
    const left = heap.shift();
    const right = heap.shift();
    const node = {
      symbol: null,
      frequency: left.frequency + right.frequency,
      order: order++,
      left,
      right,
    };
    let index = heap.findIndex(item => compare(node, item) < 0);
    if (index < 0) index = heap.length;
    heap.splice(index, 0, node);
  }

  const codes = new Map();
  let treeBits = 0;
  function visit(node, depth) {
    if (node.symbol !== null) {
      codes.set(node.symbol, Math.max(1, depth));
      treeBits += 16;
      return;
    }
    treeBits += 8;
    visit(node.left, depth + 1);
    visit(node.right, depth + 1);
  }
  visit(heap[0], 0);
  return { codes, treeBits };
}

function huffmanDataStats(data) {
  if (data.length === 0) return { finalSizeBits: 0, chartData: [] };

  const { codes, treeBits } = buildHuffmanCodes(data);
  const chartData = [];
  let encodedBits = 0;
  const treeSizeBits = paddedBits(treeBits);
  for (const byte of data) {
    encodedBits += codes.get(byte);
    chartData.push(treeSizeBits + paddedBits(encodedBits));
  }
  return { finalSizeBits: chartData[chartData.length - 1], chartData };
}

function tokenizeLz(data) {
  const tokens = [];
  let position = 0;
  while (position < data.length) {
    const windowStart = Math.max(0, position - 255);
    const candidates = [];
    let bestLength = 0;
    let bestDistance = 0;

    if (position + 3 <= data.length) {
      for (let start = windowStart; start < position; start++) {
        if (
          data[start] === data[position] &&
          start + 1 < position && data[start + 1] === data[position + 1] &&
          start + 2 < position && data[start + 2] === data[position + 2]
        ) candidates.push(start);
      }

      for (const start of candidates.slice(-128)) {
        let length = 0;
        while (
          length < 255 &&
          position + length < data.length &&
          data[start + length] === data[position + length]
        ) length++;
        if (length > bestLength) {
          bestLength = length;
          bestDistance = position - start;
        }
      }
    }

    if (bestLength >= 3) {
      const length = Math.min(bestLength, 255);
      tokens.push({ type: 'match', distance: Math.min(bestDistance, 255), length, consumed: length });
      position += length;
    } else {
      tokens.push({ type: 'literal', value: data[position], consumed: 1 });
      position++;
    }
  }
  return tokens;
}

function lzTokenBytes(tokens) {
  const bytes = [];
  for (const token of tokens) {
    if (token.type === 'literal') bytes.push(0, token.value);
    else bytes.push(1, token.distance, token.length);
  }
  return bytes;
}

function rawStats(data) {
  const chartData = Array.from(data, (_, index) => (index + 1) * 8);
  return { finalSizeBits: data.length * 8, chartData };
}

function lzTokenStats(tokens) {
  const chartData = [];
  let sizeBits = 0;
  for (const token of tokens) {
    sizeBits += token.type === 'literal' ? 16 : 24;
    for (let i = 0; i < token.consumed; i++) chartData.push(sizeBits);
  }
  return { finalSizeBits: sizeBits, chartData };
}

function lzStats(text) {
  return lzTokenStats(tokenizeLz(toBytes(text)));
}

function huffmanStats(text) {
  return huffmanDataStats(toBytes(text));
}

function hybridStats(text) {
  const data = toBytes(text);
  if (data.length === 0) return { finalSizeBits: 0, chartData: [], method: 'raw' };

  const tokens = tokenizeLz(data);
  const tokenData = lzTokenBytes(tokens);
  const { codes, treeBits } = buildHuffmanCodes(tokenData);
  const encodedChart = [];
  let encodedBits = 0;
  const overheadBits = 64 + paddedBits(treeBits);
  for (const token of tokens) {
    const encodedToken = token.type === 'literal'
      ? [0, token.value]
      : [1, token.distance, token.length];
    for (const byte of encodedToken) encodedBits += codes.get(byte);
    const sizeBits = overheadBits + paddedBits(encodedBits);
    for (let i = 0; i < token.consumed; i++) encodedChart.push(sizeBits);
  }

  const candidates = [
    { ...rawStats(data), method: 'raw' },
    { ...lzTokenStats(tokens), method: 'LZ' },
    {
      finalSizeBits: encodedChart[encodedChart.length - 1],
      chartData: encodedChart,
      method: 'LZ + Хаффман',
    },
  ];
  return candidates.reduce((best, candidate) =>
    candidate.finalSizeBits < best.finalSizeBits ? candidate : best);
}

async function deflateStats(text) {
  const data = toBytes(text);
  if (data.length === 0) return { finalSizeBits: 0, chartData: [] };
  if (typeof CompressionStream === 'undefined') {
    throw new Error('Браузер не поддерживает нативное сжатие DEFLATE.');
  }

  const compressedStream = new Blob([data])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  const compressedBytes = new Uint8Array(await new Response(compressedStream).arrayBuffer());
  const finalSizeBits = compressedBytes.length * 8;
  const chartData = Array.from(data, (_, index) =>
    Math.round(finalSizeBits * (index + 1) / data.length));
  return { finalSizeBits, chartData };
}

function shannonEntropy(text) {
  const data = toBytes(text);
  if (data.length === 0) return 0;
  const frequencies = new Map();
  for (const byte of data) frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
  let entropy = 0;
  for (const frequency of frequencies.values()) {
    const probability = frequency / data.length;
    if (probability !== 0 && probability !== 1) {
      entropy -= probability * Math.log2(probability);
    }
  }
  return entropy;
}

window.ArenaCore = {
  deflateStats,
  huffmanStats,
  hybridStats,
  lzStats,
  shannonEntropy,
};
})();
