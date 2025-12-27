const API_BASE = (() => {
    const FALLBACK = "http://127.0.0.1:8000";
    if (window.location.protocol.startsWith("http")) {
        const host = window.location.hostname || "127.0.0.1";
        return `${window.location.protocol}//${host}:8000`;
    }
    return FALLBACK;
})();
const IS_FILE_PROTOCOL = window.location.protocol === "file:";
const STORAGE_TOKEN_KEY = "studio-notes-token";
const STORAGE_USER_KEY = "studio-notes-user";

const toastEl = document.getElementById("toast");

const state = {
    token: localStorage.getItem(STORAGE_TOKEN_KEY) || "",
    user: (() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_USER_KEY) || "null");
        } catch (error) {
            return null;
        }
    })(),
};

const workspaceMetrics = {
    categories: 0,
    entries: 0,
    highlightName: "No boards yet",
    highlightCount: 0,
    latestCategoryId: null,
};

function showToast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.style.background = isError ? "#b3261e" : "#026670";
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2600);
}

function notifyAuthChange() {
    document.dispatchEvent(new CustomEvent("auth:changed", { detail: { user: state.user } }));
}

function updateWorkspaceHero(stats) {
    if (stats) {
        workspaceMetrics.categories = stats.categories ?? workspaceMetrics.categories;
        workspaceMetrics.entries = stats.entries ?? workspaceMetrics.entries;
        workspaceMetrics.highlightName = stats.highlightName ?? workspaceMetrics.highlightName;
        workspaceMetrics.highlightCount = stats.highlightCount ?? workspaceMetrics.highlightCount;
        workspaceMetrics.latestCategoryId = stats.latestCategoryId ?? workspaceMetrics.latestCategoryId;
    }

    const heroNameEl = document.getElementById("hero-username");
    if (heroNameEl) {
        heroNameEl.textContent = state.user ? state.user.username : "Designer";
    }

    const statCategoriesEl = document.getElementById("stat-categories");
    const statEntriesEl = document.getElementById("stat-entries");
    const statFocusCountEl = document.getElementById("stat-focus-count");
    const statFocusLabelEl = document.getElementById("stat-focus-label");
    const highlightNameEl = document.getElementById("stat-highlight-name");
    const highlightCountEl = document.getElementById("stat-highlight-count");
    const noteBodyEl = document.getElementById("workspace-note-body");

    statCategoriesEl && (statCategoriesEl.textContent = workspaceMetrics.categories);
    statEntriesEl && (statEntriesEl.textContent = workspaceMetrics.entries);
    statFocusCountEl && (statFocusCountEl.textContent = workspaceMetrics.highlightCount);
    statFocusLabelEl && (statFocusLabelEl.textContent = workspaceMetrics.highlightName);
    highlightNameEl && (highlightNameEl.textContent = workspaceMetrics.highlightName);
    highlightCountEl && (highlightCountEl.textContent = workspaceMetrics.highlightCount);

    if (noteBodyEl) {
        if (workspaceMetrics.entries === 0) {
            noteBodyEl.textContent = "Sketch three starter boards: structure, envelope, interiors. Compare as you go.";
        } else if (workspaceMetrics.entries < 6) {
            noteBodyEl.textContent = "Add reference photos to each entry so juries can read the story in seconds.";
        } else {
            noteBodyEl.textContent = "You're tracking " + workspaceMetrics.entries + " specs. Tag costs to prep a budget narrative.";
        }
    }
}

function updateShellVisibility() {
    const navUsername = document.getElementById("nav-username");
    const logoutBtn = document.getElementById("nav-logout");
    const appShell = document.getElementById("app-shell");
    const authInvite = document.getElementById("auth-invite");
    const welcomeEl = document.getElementById("app-welcome");
    const publicHero = document.getElementById("public-hero");
    const workspaceHero = document.getElementById("workspace-hero");

    if (navUsername) {
        navUsername.textContent = state.user ? `@${state.user.username}` : "Guest";
    }
    if (logoutBtn) {
        logoutBtn.classList.toggle("hidden", !state.user);
    }
    if (appShell && authInvite) {
        appShell.classList.toggle("hidden", !state.user);
        authInvite.classList.toggle("hidden", !!state.user);
    }
    if (welcomeEl && state.user) {
        welcomeEl.textContent = `Hi ${state.user.username}, your workspace is ready.`;
    }
    if (publicHero && workspaceHero) {
        publicHero.classList.toggle("hidden", !!state.user);
        workspaceHero.classList.toggle("hidden", !state.user);
    }
    updateWorkspaceHero();
}

function persistAuth(token, user, { silent = false } = {}) {
    state.token = token;
    state.user = user;
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    updateShellVisibility();
    notifyAuthChange();
    if (!silent) {
        showToast(`Welcome, ${user.username}!`);
        document.getElementById("workspace-hero")?.scrollIntoView({ behavior: "smooth" });
    }
}

function clearAuth(silent = false) {
    const hadUser = Boolean(state.user);
    state.token = "";
    state.user = null;
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    updateShellVisibility();
    notifyAuthChange();
    updateWorkspaceHero({
        categories: 0,
        entries: 0,
        highlightName: "No boards yet",
        highlightCount: 0,
        latestCategoryId: null,
    });
    if (hadUser && !silent) {
        showToast("Signed out");
    }
}

function redirectToLanding() {
    window.location.href = "index.html";
}

async function safeFetch(url, options = {}) {
    const config = { ...options };
    const skipAuth = Boolean(config.skipAuth);
    const muteErrors = Boolean(config.muteErrors);
    delete config.skipAuth;
    delete config.muteErrors;

    if (IS_FILE_PROTOCOL) {
        const message = "Run a local HTTP server (python -m http.server 5500) and open http://127.0.0.1:5500 to use the API.";
        if (!muteErrors) {
            showToast(message, true);
        }
        throw new Error(message);
    }

    const headers = new Headers(config.headers || {});
    if (!skipAuth && state.token) {
        headers.set("Authorization", `Bearer ${state.token}`);
    }
    config.headers = headers;

    let response;
    try {
        response = await fetch(url, config);
    } catch (networkError) {
        if (!muteErrors) {
            showToast("Network error. Please try again.", true);
        }
        throw networkError;
    }

    if (!response.ok) {
        let message = "Request failed";
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            const detail = await response.json().catch(() => ({}));
            message = detail?.detail || detail?.message || message;
        }
        if (response.status === 401) {
            message = "Session expired. Please sign in again.";
            clearAuth(true);
        }
        if (!muteErrors) {
            showToast(message, true);
        }
        throw new Error(message);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }
    return response;
}

function formToObject(form) {
    const formData = new FormData(form);
    return Object.fromEntries(formData.entries());
}

function wireAuthForms() {
    const signupForm = document.getElementById("signup-form");
    const loginForm = document.getElementById("login-form");

    signupForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = formToObject(signupForm);
        payload.username = payload.username.trim();
        if (payload.username.length < 3) {
            showToast("Username should be at least 3 characters", true);
            return;
        }
        if ((payload.password || "").length < 6) {
            showToast("Password should be at least 6 characters", true);
            return;
        }
        const response = await safeFetch(`${API_BASE}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            skipAuth: true,
        });
        signupForm.reset();
        persistAuth(response.token, response.user);
    });

    loginForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = formToObject(loginForm);
        const response = await safeFetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            skipAuth: true,
        });
        loginForm.reset();
        persistAuth(response.token, response.user);
    });
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById("nav-logout");
    if (!logoutBtn) return;
    logoutBtn.addEventListener("click", async () => {
        if (!state.token) {
            showToast("You are not signed in yet.", true);
            return;
        }
        try {
            await safeFetch(`${API_BASE}/logout`, { method: "POST" });
        } catch (error) {
            // Already handled by safeFetch
        } finally {
            clearAuth();
            redirectToLanding();
        }
    });
}

function initCategoriesPage() {
    const listEl = document.getElementById("category-list");
    const formEl = document.getElementById("category-form");
    const template = document.getElementById("category-card-template");
    const refreshBtn = document.getElementById("refresh-categories");

    async function loadCategories() {
        if (!state.user) {
            listEl.innerHTML = "<p class='empty-state'>Sign in to see your categories.</p>";
            updateWorkspaceHero({
                categories: 0,
                entries: 0,
                highlightName: "Start your first board",
                highlightCount: 0,
                latestCategoryId: null,
            });
            return;
        }
        listEl.innerHTML = "<p class='empty-state'>Loading...</p>";
        const categories = await safeFetch(`${API_BASE}/categories`);
        if (!categories.length) {
            listEl.innerHTML = "<p class='empty-state'>No categories yet. Start by adding one.</p>";
            updateWorkspaceHero({
                categories: 0,
                entries: 0,
                highlightName: "Start your first board",
                highlightCount: 0,
                latestCategoryId: null,
            });
            return;
        }
        listEl.innerHTML = "";
        const statsPayload = {
            categories: categories.length,
            entries: categories.reduce((sum, category) => sum + (category.entry_count || 0), 0),
            highlightName: categories[0]?.name || "Fresh board",
            highlightCount: categories[0]?.entry_count || 0,
            latestCategoryId: categories[0]?.id ?? null,
        };
        updateWorkspaceHero(statsPayload);
        categories.forEach((category) => {
            const node = template.content.firstElementChild.cloneNode(true);
            node.querySelector(".category-card__title").textContent = category.name;
            node.querySelector(
                ".category-card__count"
            ).textContent = `${category.entry_count} entr${category.entry_count === 1 ? "y" : "ies"}`;
            node.querySelector("a").href = `category.html?id=${category.id}`;
            listEl.appendChild(node);
        });
    }

    formEl?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.user) {
            showToast("Please log in first.", true);
            return;
        }
        const formData = new FormData(formEl);
        const payload = Object.fromEntries(formData.entries());
        if (!payload.name?.trim()) {
            showToast("Please type a name", true);
            return;
        }
        await safeFetch(`${API_BASE}/categories`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: payload.name.trim() }),
        });
        formEl.reset();
        showToast("Category added");
        loadCategories();
    });

    refreshBtn?.addEventListener("click", loadCategories);

    document.addEventListener("auth:changed", () => {
        updateShellVisibility();
        if (state.user) {
            loadCategories();
        } else {
            listEl.innerHTML = "<p class='empty-state'>Sign in to see your categories.</p>";
        }
    });

    updateShellVisibility();
    if (state.user) {
        loadCategories();
    } else {
        listEl.innerHTML = "<p class='empty-state'>Sign in to see your categories.</p>";
    }
}

function setupWorkspaceActions() {
    const latestBtn = document.getElementById("open-latest-board");
    if (!latestBtn) return;
    latestBtn.addEventListener("click", () => {
        if (!state.user) {
            showToast("Please log in first.", true);
            return;
        }
        if (!workspaceMetrics.latestCategoryId) {
            showToast("Create a board to open it.", true);
            return;
        }
        window.location.href = `category.html?id=${workspaceMetrics.latestCategoryId}`;
    });
}

function initCategoryDetailPage() {
    const params = new URLSearchParams(window.location.search);
    const categoryId = params.get("id");
    const entriesTable = document.getElementById("entries-table");
    const entryTemplate = document.getElementById("entry-row-template");
    const imageTemplate = document.getElementById("image-chip-template");
    const refreshBtn = document.getElementById("refresh-entries");
    const entryForm = document.getElementById("entry-form");
    const formTitle = document.getElementById("entry-form-title");
    const submitBtn = document.getElementById("entry-submit-btn");
    const cancelBtn = document.getElementById("entry-cancel-btn");
    const categoryTitle = document.getElementById("category-title");
    const categorySummary = document.getElementById("category-summary");

    if (!state.user) {
        showToast("Please log in to view categories", true);
        window.location.href = "index.html";
        return;
    }

    if (!categoryId) {
        categoryTitle.textContent = "Category missing";
        categorySummary.textContent = "No category id detected in the URL.";
        return;
    }

    let currentEntries = [];

    async function loadCategory() {
        const data = await safeFetch(`${API_BASE}/categories/${categoryId}`);
        categoryTitle.textContent = data.name;
        categorySummary.textContent = `${data.entries.length} entr${
            data.entries.length === 1 ? "y" : "ies"
        } saved for this topic.`;
        currentEntries = data.entries;
        renderEntries();
    }

    function renderEntries() {
        if (!currentEntries.length) {
            entriesTable.innerHTML =
                "<tr><td colspan='7' class='empty-state'>No entries saved. Use the form to add one.</td></tr>";
            return;
        }
        entriesTable.innerHTML = "";
        currentEntries.forEach((entry) => {
            const row = entryTemplate.content.firstElementChild.cloneNode(true);
            row.querySelector("[data-cell='type']").textContent = entry.item_type;
            row.querySelector("[data-cell='name']").textContent = entry.name;
            row.querySelector("[data-cell='dimensions']").textContent = entry.dimensions || "—";
            row.querySelector("[data-cell='price']").textContent = formatPrice(entry.price);
            row.querySelector("[data-cell='notes']").textContent = entry.notes || "—";

            const imageContainer = row.querySelector("[data-cell='images']");
            if (!entry.images.length) {
                imageContainer.innerHTML = "<span class='muted'>No images</span>";
            } else {
                entry.images.forEach((image) => {
                    const chip = imageTemplate.content.firstElementChild.cloneNode(true);
                    chip.querySelector("img").src = `${API_BASE}${image.file_path}`;
                    chip.querySelector("button").addEventListener("click", () => {
                        deleteImage(image.id, entry.id);
                    });
                    imageContainer.appendChild(chip);
                });
            }

            const actionsCell = row.querySelector("[data-cell='actions']");
            actionsCell.classList.add("table-actions");

            const editBtn = document.createElement("button");
            editBtn.className = "btn secondary";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => startEdit(entry));

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn ghost";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", () => deleteEntry(entry.id));

            actionsCell.append(editBtn, deleteBtn);
            entriesTable.appendChild(row);
        });
    }

    function formatPrice(value) {
        if (value === null || value === undefined) return "—";
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
        }).format(value);
    }

    function startEdit(entry) {
        formTitle.textContent = "Edit Entry";
        submitBtn.textContent = "Update Entry";
        entryForm.dataset.mode = "edit";
        document.getElementById("entry-id").value = entry.id;
        entryForm.item_type.value = entry.item_type;
        entryForm.name.value = entry.name;
        entryForm.dimensions.value = entry.dimensions || "";
        entryForm.price.value = entry.price ?? "";
        entryForm.notes.value = entry.notes || "";
        window.scrollTo({ top: entryForm.offsetTop - 40, behavior: "smooth" });
    }

    function resetForm() {
        entryForm.reset();
        entryForm.dataset.mode = "create";
        document.getElementById("entry-id").value = "";
        formTitle.textContent = "Add Entry";
        submitBtn.textContent = "Save Entry";
    }

    cancelBtn?.addEventListener("click", resetForm);

    entryForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const mode = entryForm.dataset.mode || "create";
        const formData = new FormData(entryForm);
        formData.delete("entryId");
        if ((formData.get("item_type") || "").trim() === "") {
            showToast("Type is required", true);
            return;
        }
        if ((formData.get("name") || "").trim() === "") {
            showToast("Name is required", true);
            return;
        }
        let url = `${API_BASE}/categories/${categoryId}/entries`;
        let method = "POST";
        if (mode === "edit") {
            const entryId = document.getElementById("entry-id").value;
            if (!entryId) {
                showToast("No entry selected", true);
                return;
            }
            url = `${API_BASE}/entries/${entryId}`;
            method = "PUT";
            if (!formData.has("remove_image_ids")) {
                formData.append("remove_image_ids", "");
            }
        }
        await safeFetch(url, {
            method,
            body: formData,
        });
        showToast(mode === "edit" ? "Entry updated" : "Entry added");
        resetForm();
        document.getElementById("entry-images").value = "";
        loadCategory();
    });

    async function deleteEntry(entryId) {
        if (!confirm("Delete this entry?")) return;
        await safeFetch(`${API_BASE}/entries/${entryId}`, { method: "DELETE" });
        showToast("Entry deleted");
        loadCategory();
    }

    async function deleteImage(imageId, entryId) {
        if (!confirm("Remove this image?")) return;
        await safeFetch(`${API_BASE}/images/${imageId}`, { method: "DELETE" });
        showToast("Image removed");
        await loadCategory();
        if (entryForm.dataset.mode === "edit" && document.getElementById("entry-id").value === `${entryId}`) {
            const updated = currentEntries.find((entry) => entry.id === entryId);
            if (updated) {
                entryForm.notes.value = updated.notes || "";
            }
        }
    }

    refreshBtn?.addEventListener("click", loadCategory);
    loadCategory();
}

async function bootstrapAuth() {
    if (!state.token) {
        updateShellVisibility();
        return;
    }
    try {
        const user = await safeFetch(`${API_BASE}/me`, { muteErrors: true });
        if (user) {
            persistAuth(state.token, user, { silent: true });
        }
    } catch (error) {
        // Already handled by safeFetch
    } finally {
        updateShellVisibility();
    }
}

async function init() {
    updateShellVisibility();
    await bootstrapAuth();
    setupLogoutButton();
    setupWorkspaceActions();

    const page = document.body.dataset.page;
    if (page === "categories") {
        wireAuthForms();
        initCategoriesPage();
    }
    if (page === "category-detail") {
        initCategoryDetailPage();
    }
}

document.addEventListener("DOMContentLoaded", init);
