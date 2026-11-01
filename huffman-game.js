/**
 * Модуль 1: «Построй дерево Хаффмана»
 * Требует глобальный `vis` (vis-network standalone) на странице.
 */

(() => {
const THEME = {
  neon: '#10b981',
  bg: '#f8fafc',
  nodeBg: '#ffffff',
  text: '#0f172a',
  select: '#f59e0b',
  error: '#ef4444',
  dim: '#e2e8f0',
  font: 'Inter, sans-serif',
};

const ERROR_TEXT = 'Нарушена оптимальность алгоритма Хаффмана!';

class HuffmanGame {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.container   контейнер для сети
   * @param {string} opts.text             входная строка, напр. "МАТЕМАТИКА"
   * @param {(msg:string)=>void} [opts.onStatus]
   * @param {(msg:string)=>void} [opts.onError]
   * @param {(result:Object)=>void} [opts.onComplete]
   */
  constructor({ container, text, onStatus = () => {}, onError = () => {}, onComplete = () => {} }) {
    this.container = container;
    this.text = text;
    this.onStatus = onStatus;
    this.onError = onError;
    this.onComplete = onComplete;

    this.tree = new Map();      // id -> { id, weight, symbol, left, right }
    this.pool = new Set();      // id активных узлов (текущий пул Хаффмана)
    this.selected = [];         // до двух выбранных id (в порядке клика)
    this.counter = 0;
    this.finished = false;
    this.interactionLocked = false;

    this.initNetwork();
    this.reset(text);
  }

  /* ---------- Инициализация Vis.js ---------- */

  initNetwork() {
    this.nodes = new vis.DataSet();
    this.edges = new vis.DataSet();

    const options = {
      nodes: {
        shape: 'box',
        borderWidth: 2,
        margin: 10,
        color: {
          background: THEME.nodeBg,
          border: THEME.neon,
          highlight: { background: THEME.nodeBg, border: THEME.select },
          hover: { background: THEME.nodeBg, border: THEME.neon },
        },
        font: { color: THEME.text, face: THEME.font, size: 16 },
        shadow: { enabled: true, color: THEME.neon, size: 12, x: 0, y: 0 },
      },
      edges: {
        color: { color: THEME.neon, highlight: THEME.select },
        width: 2,
        smooth: { type: 'continuous' },
        font: {
          color: THEME.neon, face: THEME.font, size: 18,
          strokeWidth: 4, strokeColor: THEME.bg, align: 'middle',
        },
      },
      physics: {
        enabled: true,
        solver: 'barnesHut',
        barnesHut: {
          gravitationalConstant: -2000,
          springLength: 110,
          springConstant: 0.04,
          damping: 0.3,
        },
        stabilization: { iterations: 150 },
      },
      interaction: { dragNodes: true, hover: true, multiselect: false },
    };

    this.network = new vis.Network(
      this.container,
      { nodes: this.nodes, edges: this.edges },
      options
    );
    this.container.style.background = THEME.bg;

    this.network.on('click', (params) => {
      if (params.nodes.length) this.handleNodeClick(params.nodes[0]);
    });
  }

  /* ---------- Старт / сброс ---------- */

  reset(text = this.text) {
    this.text = text;
    this.tree.clear();
    this.pool.clear();
    this.selected = [];
    this.counter = 0;
    this.finished = false;
    this.interactionLocked = false;
    this.nodes.clear();
    this.edges.clear();

    const freq = new Map();
    for (const ch of text) freq.set(ch, (freq.get(ch) || 0) + 1);
    this.total = [...freq.values()].reduce((a, b) => a + b, 0);

    for (const [symbol, weight] of freq) {
      const id = `L${this.counter++}`;
      this.tree.set(id, { id, weight, symbol, left: null, right: null });
      this.pool.add(id);
      this.nodes.add({ id, label: `${symbol}\n${weight}` });
    }

    this.onStatus(`Листьев: ${this.pool.size}. Выберите два узла с минимальным весом.`);
    if (this.pool.size === 1) this.finish();
  }

  /* ---------- Клики и выбор ---------- */

  handleNodeClick(id) {
    if (this.finished || this.interactionLocked) return;
    if (!this.pool.has(id)) {
      this.onStatus('Этот узел уже объединён. Выбирайте узлы из активного пула.');
      return;
    }

    const idx = this.selected.indexOf(id);
    if (idx !== -1) {                      // повторный клик снимает выбор
      this.selected.splice(idx, 1);
      this.paintNode(id);
      return;
    }

    this.selected.push(id);
    this.paintNode(id, THEME.select);

    if (this.selected.length === 2) {
      const [a, b] = this.selected;
      this.selected = [];
      this.mergeNodes(a, b);
    }
  }

  setInteractionLocked(locked) {
    this.interactionLocked = locked;
    this.selected.forEach((id) => this.paintNode(id));
    this.selected = [];
  }

  paintNode(id, border = THEME.neon) {
    this.nodes.update({
      id,
      color: { background: THEME.nodeBg, border, highlight: { background: THEME.nodeBg, border } },
    });
  }

  /* ---------- Валидация оптимальности ---------- */

  /**
   * Выбранные узлы допустимы, если их веса совпадают с двумя наименьшими
   * весами пула (мультимножества). Это корректно учитывает ничьи:
   * при равных весах подойдёт любой из равноценных узлов.
   */
  isOptimalChoice(idA, idB) {
    if (
      idA === idB ||
      !this.pool.has(idA) ||
      !this.pool.has(idB) ||
      !this.tree.has(idA) ||
      !this.tree.has(idB)
    ) {
      return false;
    }

    const poolWeights = [...this.pool].map((id) => this.tree.get(id).weight).sort((x, y) => x - y);
    const chosen = [this.tree.get(idA).weight, this.tree.get(idB).weight].sort((x, y) => x - y);
    return chosen[0] === poolWeights[0] && chosen[1] === poolWeights[1];
  }

  /* ---------- Слияние ---------- */

  mergeNodes(idA, idB) {
    if (this.finished || this.interactionLocked) {
      return false;
    }

    if (
      idA === idB ||
      !this.pool.has(idA) ||
      !this.pool.has(idB) ||
      !this.tree.has(idA) ||
      !this.tree.has(idB)
    ) {
      this.onStatus('Выбирайте два разных узла из активного пула.');
      return false;
    }

    if (!this.isOptimalChoice(idA, idB)) {
      this.flashError([idA, idB]);
      this.onError(ERROR_TEXT);
      return false;
    }

    // Меньший вес -> ветка '0', больший -> '1'
    let [left, right] = [this.tree.get(idA), this.tree.get(idB)];
    if (left.weight > right.weight) [left, right] = [right, left];

    const id = `N${this.counter++}`;
    const parent = { id, weight: left.weight + right.weight, symbol: null, left: left.id, right: right.id };
    this.tree.set(id, parent);

    this.pool.delete(left.id);
    this.pool.delete(right.id);
    this.pool.add(id);

    this.nodes.add({ id, label: String(parent.weight) });
    this.edges.add([
      { from: id, to: left.id, label: '0' },
      { from: id, to: right.id, label: '1' },
    ]);
    [left.id, right.id].forEach((cid) => this.paintNode(cid, THEME.dim));

    this.onStatus(`Объединено: ${left.weight} + ${right.weight} = ${parent.weight}. В пуле: ${this.pool.size}.`);
    if (this.pool.size === 1) this.finish();
    return true;
  }

  flashError(ids) {
    ids.forEach((id) => this.paintNode(id, THEME.error));
    setTimeout(() => ids.forEach((id) => this.paintNode(id)), 700);
  }

  /* ---------- Финал: коды, средняя длина, энтропия ---------- */

  assignCodes(rootId) {
    const codes = new Map();
    const walk = (id, prefix) => {
      const n = this.tree.get(id);
      if (n.symbol !== null) { codes.set(n.symbol, prefix || '0'); return; } // 1 символ -> '0'
      walk(n.left, prefix + '0');
      walk(n.right, prefix + '1');
    };
    walk(rootId, '');
    return codes;
  }

  finish() {
    this.finished = true;
    const rootId = [...this.pool][0];
    const codes = this.assignCodes(rootId);

    let avgLen = 0;
    let entropy = 0;
    let pMax = 0;

    for (const n of this.tree.values()) {
      if (n.symbol === null) continue;
      const p = n.weight / this.total;
      const len = codes.get(n.symbol).length;
      avgLen += p * len;
      entropy -= p * Math.log2(p);
      pMax = Math.max(pMax, p);
      this.nodes.update({ id: n.id, label: `${n.symbol}\n${n.weight}\n${codes.get(n.symbol)}` });
    }
    entropy = Math.abs(entropy); // убирает -0 при одном символе

    const redundancy = avgLen - entropy;
    const efficiency = avgLen > 0 ? (entropy / avgLen) * 100 : 100;
    const gallager = entropy + pMax + 0.086;

    const conclusion =
      `Средняя длина кода L = ${avgLen.toFixed(4)} бит/символ. ` +
      `Энтропия Шеннона H = ${entropy.toFixed(4)} бит/символ. ` +
      `Избыточность L − H = ${redundancy.toFixed(4)} бит; эффективность H/L = ${efficiency.toFixed(2)}%. ` +
      `Теорема Шеннона для префиксных кодов: H ≤ L < H + 1 — ` +
      `${avgLen >= entropy - 1e-12 && avgLen < entropy + 1 ? 'выполнено' : 'НЕ выполнено'}. ` +
      `Уточнённая оценка Галлагера: L ≤ H + p_max + 0.086 = ${gallager.toFixed(4)} — ` +
      `${avgLen <= gallager + 1e-12 ? 'выполнено' : 'НЕ выполнено'}. ` +
      (redundancy < 1e-9
        ? 'Вероятности — точные степени двойки: код достигает границы энтропии.'
        : 'Равенство L = H недостижимо, т.к. длины кодов целые, а −log₂p в общем случае нет.');

    const result = { codes: Object.fromEntries(codes), avgLen, entropy, redundancy, efficiency, gallager, conclusion };
    this.onStatus('Дерево построено!');
    this.onComplete(result);
    return result;
  }
}

window.HuffmanGame = HuffmanGame;
})();
