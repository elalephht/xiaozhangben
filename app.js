const DB_NAME = "xiaozhangben-db";
const DB_VERSION = 1;
const STORE = "appState";
const STATE_KEY = "snapshot";

const DEFAULT_STATE = {
  ledgers: [
    { id: crypto.randomUUID(), name: "小账本", color: "#8fbceb" },
    { id: crypto.randomUUID(), name: "旅行账本", color: "#b7d8c7" }
  ],
  categories: [
    { id: crypto.randomUUID(), name: "餐饮", kind: "expense", icon: "🍽", color: "#f7c6b7" },
    { id: crypto.randomUUID(), name: "交通", kind: "expense", icon: "🚌", color: "#a9ccf4" },
    { id: crypto.randomUUID(), name: "购物", kind: "expense", icon: "🛍", color: "#b3d8c2" },
    { id: crypto.randomUUID(), name: "猫咪", kind: "expense", icon: "🐾", color: "#d6e6fa" },
    { id: crypto.randomUUID(), name: "工资", kind: "income", icon: "💴", color: "#bde6cc" },
    { id: crypto.randomUUID(), name: "兼职", kind: "income", icon: "✨", color: "#d8e4f8" }
  ],
  budgets: [],
  transactions: [],
  selectedLedgerId: null
};

DEFAULT_STATE.selectedLedgerId = DEFAULT_STATE.ledgers[0].id;
DEFAULT_STATE.budgets = [
  { id: crypto.randomUUID(), ledgerId: DEFAULT_STATE.ledgers[0].id, amount: 3000 },
  { id: crypto.randomUUID(), ledgerId: DEFAULT_STATE.ledgers[1].id, amount: 2000 }
];
DEFAULT_STATE.transactions = [
  createTransaction(DEFAULT_STATE.ledgers[0].id, "expense", "餐饮", 26.5, "早餐和咖啡", "wechat", today()),
  createTransaction(DEFAULT_STATE.ledgers[0].id, "expense", "购物", 120, "买了收纳盒", "alipay", shiftDate(-1)),
  createTransaction(DEFAULT_STATE.ledgers[0].id, "income", "工资", 6800, "本月发薪", "bankCard", shiftDate(-2)),
  createTransaction(DEFAULT_STATE.ledgers[1].id, "expense", "交通", 88, "高铁打车", "alipay", today())
];

let db;
let state;

const els = {
  ledgerList: document.querySelector("#ledger-list"),
  currentLedgerName: document.querySelector("#current-ledger-name"),
  monthExpense: document.querySelector("#month-expense"),
  monthIncome: document.querySelector("#month-income"),
  budgetTotal: document.querySelector("#budget-total"),
  budgetFill: document.querySelector("#budget-fill"),
  budgetCaption: document.querySelector("#budget-caption"),
  transactionList: document.querySelector("#transaction-list"),
  insightsList: document.querySelector("#insights-list"),
  insightsPanel: document.querySelector("#insights-panel"),
  categorySelect: document.querySelector("#category-select"),
  transactionDialog: document.querySelector("#transaction-dialog"),
  ledgerDialog: document.querySelector("#ledger-dialog"),
  budgetDialog: document.querySelector("#budget-dialog"),
  transactionForm: document.querySelector("#transaction-form"),
  ledgerForm: document.querySelector("#ledger-form"),
  budgetForm: document.querySelector("#budget-form"),
  template: document.querySelector("#transaction-item-template")
};

boot().catch((error) => {
  console.error(error);
  alert("初始化失败，请刷新页面后重试。");
});

async function boot() {
  db = await openDB();
  state = await loadState();
  bindEvents();
  render();
  registerServiceWorker();
}

function bindEvents() {
  document.querySelector("#open-transaction-dialog").addEventListener("click", openTransactionDialog);
  document.querySelector("#open-transaction-fab").addEventListener("click", openTransactionDialog);
  document.querySelector("#open-ledger-dialog").addEventListener("click", () => els.ledgerDialog.showModal());
  document.querySelector("#open-budget-dialog").addEventListener("click", openBudgetDialog);
  document.querySelector("#toggle-insights").addEventListener("click", () => els.insightsPanel.classList.toggle("hidden"));

  els.transactionForm.addEventListener("change", (event) => {
    if (event.target.name === "kind") {
      renderCategoryOptions(event.target.value);
    }
  });

  els.transactionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(els.transactionForm);
    const selectedLedger = getSelectedLedger();
    const payload = {
      id: crypto.randomUUID(),
      ledgerId: selectedLedger.id,
      kind: formData.get("kind"),
      amount: Number(formData.get("amount")),
      categoryId: formData.get("categoryId"),
      paymentMethod: formData.get("paymentMethod"),
      note: String(formData.get("note") || "").trim(),
      date: formData.get("date"),
      createdAt: new Date().toISOString()
    };

    if (!payload.amount || payload.amount <= 0) {
      return;
    }

    state.transactions.unshift(payload);
    await persistState();
    els.transactionDialog.close();
    els.transactionForm.reset();
    setDefaultTransactionDate();
    renderCategoryOptions("expense");
    render();
  });

  els.ledgerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(els.ledgerForm);
    const ledger = {
      id: crypto.randomUUID(),
      name: String(formData.get("name")).trim(),
      color: String(formData.get("color"))
    };
    if (!ledger.name) return;
    state.ledgers.push(ledger);
    state.selectedLedgerId = ledger.id;
    state.budgets.push({ id: crypto.randomUUID(), ledgerId: ledger.id, amount: 0 });
    await persistState();
    els.ledgerDialog.close();
    els.ledgerForm.reset();
    render();
  });

  els.budgetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(els.budgetForm);
    const ledger = getSelectedLedger();
    const amount = Number(formData.get("amount"));
    const existing = state.budgets.find((item) => item.ledgerId === ledger.id);
    if (existing) {
      existing.amount = amount;
    } else {
      state.budgets.push({ id: crypto.randomUUID(), ledgerId: ledger.id, amount });
    }
    await persistState();
    els.budgetDialog.close();
    render();
  });
}

function render() {
  renderLedgers();
  renderSummary();
  renderTransactions();
  renderInsights();
}

function renderLedgers() {
  els.ledgerList.innerHTML = "";
  state.ledgers.forEach((ledger) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ledger-chip" + (ledger.id === state.selectedLedgerId ? " active" : "");
    button.textContent = ledger.name;
    button.style.setProperty("--ledger-color", ledger.color);
    button.addEventListener("click", async () => {
      state.selectedLedgerId = ledger.id;
      await persistState();
      render();
    });
    els.ledgerList.appendChild(button);
  });
}

function renderSummary() {
  const ledger = getSelectedLedger();
  const list = getCurrentLedgerTransactions();
  const monthList = list.filter((item) => sameMonth(item.date, today()));
  const expense = sumByKind(monthList, "expense");
  const income = sumByKind(monthList, "income");
  const budget = state.budgets.find((item) => item.ledgerId === ledger.id)?.amount ?? 0;
  const progress = budget > 0 ? Math.min(expense / budget, 1) : 0;

  els.currentLedgerName.textContent = ledger.name;
  els.monthExpense.textContent = formatCurrency(expense);
  els.monthIncome.textContent = formatCurrency(income);
  els.budgetTotal.textContent = formatCurrency(budget);
  els.budgetFill.style.width = `${progress * 100}%`;

  if (!budget) {
    els.budgetCaption.textContent = "还没有设置预算";
  } else {
    const percent = Math.round((expense / budget) * 100);
    const safePercent = Number.isFinite(percent) ? percent : 0;
    els.budgetCaption.textContent = `已使用 ${safePercent}% ，还剩 ${formatCurrency(Math.max(budget - expense, 0))}`;
  }
}

function renderTransactions() {
  const list = getCurrentLedgerTransactions();
  els.transactionList.innerHTML = "";

  if (!list.length) {
    els.transactionList.innerHTML = `<div class="empty-state">还没有记录，先记下今天的第一笔吧。</div>`;
    return;
  }

  list.slice(0, 12).forEach((item) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const category = state.categories.find((entry) => entry.id === item.categoryId);
    node.querySelector(".transaction-badge").textContent = category?.icon ?? "🧾";
    node.querySelector(".transaction-badge").style.background = category?.color ?? "#dfeaf5";
    node.querySelector(".transaction-title").textContent = category?.name ?? "未分类";
    node.querySelector(".transaction-note").textContent = item.note || paymentMethodLabel(item.paymentMethod);
    node.querySelector(".transaction-amount").textContent = `${item.kind === "expense" ? "-" : "+"}${formatCurrency(item.amount)}`;
    node.querySelector(".transaction-amount").style.color = item.kind === "expense" ? "var(--expense)" : "var(--income)";
    node.querySelector(".transaction-date").textContent = formatDate(item.date);
    els.transactionList.appendChild(node);
  });
}

function renderInsights() {
  const list = getCurrentLedgerTransactions().filter((item) => item.kind === "expense" && sameMonth(item.date, today()));
  els.insightsList.innerHTML = "";

  if (!list.length) {
    els.insightsList.innerHTML = `<div class="empty-state">本月还没有支出记录。</div>`;
    return;
  }

  const grouped = new Map();
  list.forEach((item) => {
    const current = grouped.get(item.categoryId) ?? 0;
    grouped.set(item.categoryId, current + item.amount);
  });
  const sorted = Array.from(grouped.entries())
    .map(([categoryId, amount]) => ({
      category: state.categories.find((item) => item.id === categoryId),
      amount
    }))
    .sort((a, b) => b.amount - a.amount);

  const maxAmount = sorted[0]?.amount ?? 1;
  sorted.forEach(({ category, amount }) => {
    const row = document.createElement("article");
    row.className = "insight-row";
    row.innerHTML = `
      <div class="budget-line">
        <span>${category?.icon ?? "🧾"} ${category?.name ?? "未分类"}</span>
        <strong>${formatCurrency(amount)}</strong>
      </div>
      <div class="insight-bar">
        <div class="insight-fill" style="width:${(amount / maxAmount) * 100}%; background:${category?.color ?? "#8fbceb"}"></div>
      </div>
    `;
    els.insightsList.appendChild(row);
  });
}

function openTransactionDialog() {
  setDefaultTransactionDate();
  renderCategoryOptions(getSelectedKind());
  els.transactionDialog.showModal();
}

function openBudgetDialog() {
  const ledger = getSelectedLedger();
  const budget = state.budgets.find((item) => item.ledgerId === ledger.id)?.amount ?? "";
  els.budgetForm.elements.amount.value = budget;
  els.budgetDialog.showModal();
}

function renderCategoryOptions(kind) {
  const categories = state.categories.filter((item) => item.kind === kind);
  els.categorySelect.innerHTML = categories
    .map((item) => `<option value="${item.id}">${item.icon} ${item.name}</option>`)
    .join("");
}

function getSelectedKind() {
  return els.transactionForm.elements.kind.value || "expense";
}

function getSelectedLedger() {
  return state.ledgers.find((ledger) => ledger.id === state.selectedLedgerId) ?? state.ledgers[0];
}

function getCurrentLedgerTransactions() {
  const ledger = getSelectedLedger();
  return state.transactions
    .filter((item) => item.ledgerId === ledger.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function sumByKind(list, kind) {
  return list.filter((item) => item.kind === kind).reduce((total, item) => total + item.amount, 0);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount || 0);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function sameMonth(dateString, todayString) {
  const date = new Date(dateString);
  const base = new Date(todayString);
  return date.getFullYear() === base.getFullYear() && date.getMonth() === base.getMonth();
}

function paymentMethodLabel(value) {
  return {
    cash: "现金",
    bankCard: "银行卡",
    alipay: "支付宝",
    wechat: "微信"
  }[value] ?? "其他";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(deltaDays) {
  const date = new Date();
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function setDefaultTransactionDate() {
  els.transactionForm.elements.date.value = today();
}

function createTransaction(ledgerId, kind, categoryName, amount, note, paymentMethod, date) {
  const category = DEFAULT_STATE.categories.find((item) => item.name === categoryName && item.kind === kind);
  return {
    id: crypto.randomUUID(),
    ledgerId,
    kind,
    amount,
    categoryId: category.id,
    paymentMethod,
    note,
    date,
    createdAt: new Date().toISOString()
  };
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function loadState() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const request = store.get(STATE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? structuredClone(DEFAULT_STATE));
  });
}

function persistState() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.put(state, STATE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }
}
