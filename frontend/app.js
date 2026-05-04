const API_BASE = (() => {
    const FALLBACK = "http://127.0.0.1:8000";
    if (window.location.protocol.startsWith("http")) {
        const host = window.location.hostname || "127.0.0.1";
        return `${window.location.protocol}//${host}:8000`;
    }
    return FALLBACK;
})();
const IS_FILE_PROTOCOL = window.location.protocol === "file:";
const STORAGE_USER_KEY = "studio-notes-user";
const STORAGE_CSRF_KEY = "studio-notes-csrf";

const toastEl = document.getElementById("toast");

const state = {
    user: (() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_USER_KEY) || "null");
        } catch (error) {
            return null;
        }
    })(),
    csrf: localStorage.getItem(STORAGE_CSRF_KEY) || "",
};

const workspaceMetrics = {
    books: 0,
    pages: 0,
    highlightName: "No books yet",
    highlightCount: 0,
    latestBookId: null,
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
        workspaceMetrics.books = stats.books ?? workspaceMetrics.books;
        workspaceMetrics.pages = stats.pages ?? workspaceMetrics.pages;
        workspaceMetrics.highlightName = stats.highlightName ?? workspaceMetrics.highlightName;
        workspaceMetrics.highlightCount = stats.highlightCount ?? workspaceMetrics.highlightCount;
        workspaceMetrics.latestBookId = stats.latestBookId ?? workspaceMetrics.latestBookId;
    }

    const heroNameEl = document.getElementById("hero-username");
    if (heroNameEl) {
        heroNameEl.textContent = state.user ? state.user.username : "Designer";
    }

    const statBooksEl = document.getElementById("stat-books");
    const statPagesEl = document.getElementById("stat-pages");
    const statFocusCountEl = document.getElementById("stat-focus-count");
    const statFocusLabelEl = document.getElementById("stat-focus-label");
    const highlightNameEl = document.getElementById("stat-highlight-name");
    const highlightCountEl = document.getElementById("stat-highlight-count");
    const noteBodyEl = document.getElementById("workspace-note-body");

    statBooksEl && (statBooksEl.textContent = workspaceMetrics.books);
    statPagesEl && (statPagesEl.textContent = workspaceMetrics.pages);
    statFocusCountEl && (statFocusCountEl.textContent = workspaceMetrics.highlightCount);
    statFocusLabelEl && (statFocusLabelEl.textContent = workspaceMetrics.highlightName);
    highlightNameEl && (highlightNameEl.textContent = workspaceMetrics.highlightName);
    highlightCountEl && (highlightCountEl.textContent = workspaceMetrics.highlightCount);

    if (noteBodyEl) {
        if (workspaceMetrics.pages === 0) {
            noteBodyEl.textContent = "Start with a site tile, then a system tile, then a detail tile.";
        } else if (workspaceMetrics.pages < 6) {
            noteBodyEl.textContent = "Attach photos and anchor dimensions so crit boards feel credible.";
        } else {
            noteBodyEl.textContent = "You're tracking " + workspaceMetrics.pages + " tiles. Export when ready.";
        }
    }
}

function updateShellVisibility() {
    const navUsername = document.getElementById("nav-username");
    const logoutBtn = document.getElementById("nav-logout");
    const settingsBtn = document.getElementById("nav-settings");
    const appShell = document.getElementById("app-shell");
    const dashboardTools = document.getElementById("dashboard-tools");
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
    if (settingsBtn) {
        settingsBtn.classList.toggle("hidden", !state.user);
    }
    if (appShell && authInvite) {
        appShell.classList.toggle("hidden", !state.user);
        authInvite.classList.toggle("hidden", !!state.user);
    }
    if (dashboardTools) {
        dashboardTools.classList.toggle("hidden", !state.user);
    }
    if (welcomeEl && state.user) {
        welcomeEl.textContent = `Hi ${state.user.username}, your studio hub is ready.`;
    }
    if (publicHero && workspaceHero) {
        publicHero.classList.toggle("hidden", !!state.user);
        workspaceHero.classList.toggle("hidden", !state.user);
    }
    updateWorkspaceHero();
}

function persistAuth(user, csrf, { silent = false } = {}) {
    state.user = user;
    state.csrf = csrf || "";
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    localStorage.setItem(STORAGE_CSRF_KEY, csrf || "");
    updateShellVisibility();
    notifyAuthChange();
    if (!silent && user) {
        showToast(`Welcome, ${user.username}!`);
        document.getElementById("workspace-hero")?.scrollIntoView({ behavior: "smooth" });
    }
}

function clearAuth(silent = false) {
    const hadUser = Boolean(state.user);
    state.user = null;
    state.csrf = "";
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_CSRF_KEY);
    updateShellVisibility();
    notifyAuthChange();
    updateWorkspaceHero({
        books: 0,
        pages: 0,
        highlightName: "No books yet",
        highlightCount: 0,
        latestBookId: null,
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
    const muteErrors = Boolean(config.muteErrors);
    const skipAuth = Boolean(config.skipAuth);
    delete config.muteErrors;
    delete config.skipAuth;

    if (IS_FILE_PROTOCOL) {
        const message =
            "Run a local HTTP server (python -m http.server 5500) and open http://127.0.0.1:5500 to use the API.";
        if (!muteErrors) {
            showToast(message, true);
        }
        throw new Error(message);
    }

    const headers = new Headers(config.headers || {});
    if (!skipAuth && state.csrf) {
        headers.set("X-CSRF-Token", state.csrf);
    }
    config.headers = headers;
    config.credentials = "include";

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
    const resetForm = document.getElementById("reset-form");
    const resetConfirmForm = document.getElementById("reset-confirm-form");
    const forgotToggle = document.getElementById("forgot-password-toggle");
    const resetFlow = document.getElementById("reset-flow");
    const resetCancel = document.getElementById("reset-cancel");

    function showResetFlow() {
        loginForm?.classList.add("hidden");
        resetFlow?.classList.remove("hidden");
    }

    function hideResetFlow() {
        resetFlow?.classList.add("hidden");
        loginForm?.classList.remove("hidden");
    }

    forgotToggle?.addEventListener("click", showResetFlow);
    resetCancel?.addEventListener("click", hideResetFlow);

    signupForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = formToObject(signupForm);
        payload.username = payload.username.trim();
        payload.email = payload.email.trim();
        if (payload.username.length < 3) {
            showToast("Username should be at least 3 characters", true);
            return;
        }
        if ((payload.password || "").length < 8) {
            showToast("Password should be at least 8 characters", true);
            return;
        }
        const response = await safeFetch(`${API_BASE}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            skipAuth: true,
        });
        signupForm.reset();
        persistAuth(response.user, response.csrf_token);
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
        persistAuth(response.user, response.csrf_token);
    });

    resetForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = formToObject(resetForm);
        await safeFetch(`${API_BASE}/password-reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            skipAuth: true,
        });
        resetForm.reset();
        resetForm.classList.add("hidden");
        resetConfirmForm?.classList.remove("hidden");
        showToast("Reset code sent! Please check your email inbox.");
    });

    resetConfirmForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = formToObject(resetConfirmForm);
        await safeFetch(`${API_BASE}/password-reset/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            skipAuth: true,
        });
        resetConfirmForm.reset();
        hideResetFlow();
        showToast("Password updated");
    });
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById("nav-logout");
    if (!logoutBtn) return;
    logoutBtn.addEventListener("click", async () => {
        try {
            await safeFetch(`${API_BASE}/logout`, { method: "POST" });
        } catch (error) {
            // Already handled
        } finally {
            clearAuth();
            redirectToLanding();
        }
    });
}

function initDashboardPage() {
    const listEl = document.getElementById("book-list");
    const formEl = document.getElementById("book-form");
    const template = document.getElementById("book-card-template");
    const refreshBtn = document.getElementById("refresh-books");
    const reminderList = document.getElementById("reminder-list");
    const reminderForm = document.getElementById("reminder-form");

    async function loadDashboard() {
        if (!state.user || !reminderList) return;
        const dashboard = await safeFetch(`${API_BASE}/dashboard`);
        reminderList.innerHTML = "";
        if (!dashboard.upcoming_reminders?.length) {
            reminderList.innerHTML = "<p class='empty-state'>No upcoming reminders.</p>";
            return;
        }
        dashboard.upcoming_reminders.forEach((reminder) => {
            const item = document.createElement("div");
            item.className = "reminder-card";
            const date = new Date(reminder.remind_at).toLocaleString();
            item.innerHTML = `<strong>${reminder.title}</strong><p class='muted'>${date}</p>`;
            reminderList.appendChild(item);
        });
    }

    async function loadBooks() {
        if (!state.user) {
            listEl.innerHTML = "<p class='empty-state'>Sign in to see your books.</p>";
            updateWorkspaceHero({
                books: 0,
                pages: 0,
                highlightName: "Start your first book",
                highlightCount: 0,
                latestBookId: null,
            });
            return;
        }
        listEl.innerHTML = "<p class='empty-state'>Loading...</p>";
        const books = await safeFetch(`${API_BASE}/books`);
        if (!books.length) {
            listEl.innerHTML = "<p class='empty-state'>No books yet. Start by adding one.</p>";
            updateWorkspaceHero({
                books: 0,
                pages: 0,
                highlightName: "Start your first book",
                highlightCount: 0,
                latestBookId: null,
            });
            return;
        }
        listEl.innerHTML = "";
        const statsPayload = {
            books: books.length,
            pages: books.reduce((sum, book) => sum + (book.page_count || 0), 0),
            highlightName: books[0]?.title || "Fresh book",
            highlightCount: books[0]?.page_count || 0,
            latestBookId: books[0]?.id ?? null,
        };
        updateWorkspaceHero(statsPayload);
        books.forEach((book) => {
            const node = template.content.firstElementChild.cloneNode(true);
            node.querySelector(".category-card__title").textContent = book.title;
            node.querySelector(".category-card__count").textContent = `${book.page_count} page${
                book.page_count === 1 ? "" : "s"
            }`;
            node.querySelector("a").href = `book.html?id=${book.id}`;
            listEl.appendChild(node);
        });
    }

    formEl?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.user) {
            showToast("Please log in first.", true);
            return;
        }
        const payload = formToObject(formEl);
        if (!payload.title?.trim()) {
            showToast("Please type a title", true);
            return;
        }
        await safeFetch(`${API_BASE}/books`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: payload.title.trim(),
                sector: payload.sector?.trim() || null,
                description: payload.description?.trim() || null,
            }),
        });
        formEl.reset();
        showToast("Book added");
        loadBooks();
    });

    reminderForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = formToObject(reminderForm);
        if (!payload.title?.trim()) {
            showToast("Please add a title", true);
            return;
        }
        await safeFetch(`${API_BASE}/reminders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: payload.title.trim(),
                remind_at: new Date(payload.remind_at).toISOString(),
            }),
        });
        reminderForm.reset();
        showToast("Reminder scheduled");
        loadDashboard();
    });

    refreshBtn?.addEventListener("click", loadBooks);

    document.addEventListener("auth:changed", () => {
        updateShellVisibility();
        if (state.user) {
            loadBooks();
            loadDashboard();
        } else {
            listEl.innerHTML = "<p class='empty-state'>Sign in to see your books.</p>";
        }
    });

    updateShellVisibility();
    if (state.user) {
        loadBooks();
        loadDashboard();
    } else {
        listEl.innerHTML = "<p class='empty-state'>Sign in to see your books.</p>";
    }
}

function setupWorkspaceActions() {
    const latestBtn = document.getElementById("open-latest-book");
    if (!latestBtn) return;
    latestBtn.addEventListener("click", () => {
        if (!state.user) {
            showToast("Please log in first.", true);
            return;
        }
        if (!workspaceMetrics.latestBookId) {
            showToast("Create a book to open it.", true);
            return;
        }
        window.location.href = `book.html?id=${workspaceMetrics.latestBookId}`;
    });
}

function initBookDetailPage() {
    const params = new URLSearchParams(window.location.search);
    const bookId = params.get("id");
    const pageGrid = document.getElementById("page-grid");
    const pageTemplate = document.getElementById("page-card-template");
    const refreshBtn = document.getElementById("refresh-pages");
    const pageForm = document.getElementById("page-form");
    const formTitle = document.getElementById("page-form-title");
    const submitBtn = document.getElementById("page-submit-btn");
    const cancelBtn = document.getElementById("page-cancel-btn");
    const bookTitle = document.getElementById("book-title");
    const bookSummary = document.getElementById("book-summary");
    const downloadBtn = document.getElementById("download-report");
    const downloadPdfBtn = document.getElementById("download-report-pdf");

    if (!state.user) {
        showToast("Please log in to view books", true);
        window.location.href = "index.html";
        return;
    }

    if (!bookId) {
        bookTitle.textContent = "Book missing";
        bookSummary.textContent = "No book id detected in the URL.";
        return;
    }

    let currentPages = [];

    async function loadBook() {
        const data = await safeFetch(`${API_BASE}/books/${bookId}`);
        bookTitle.textContent = data.title;
        const count = data.pages.length;
        bookSummary.textContent = `${count} page${count === 1 ? "" : "s"} saved for this book.`;
        currentPages = data.pages;
        renderPages();
    }

    function renderPages() {
        if (!currentPages.length) {
            pageGrid.innerHTML = "<p class='empty-state'>No tiles saved. Use the form to add one.</p>";
            return;
        }
        pageGrid.innerHTML = "";
        currentPages.forEach((page) => {
            const card = pageTemplate.content.firstElementChild.cloneNode(true);
            card.querySelector(".tile-card__title").textContent = page.title;
            card.querySelector(".tile-card__meta").textContent = formatPageMeta(page);
            card.querySelector(".tile-card__note").textContent = page.note || "No notes yet.";

            const dimensionContainer = card.querySelector(".tile-card__dimensions");
            dimensionContainer.innerHTML = "";
            if (page.dimensions?.length) {
                page.dimensions.forEach(dim => {
                    const dimEl = document.createElement("div");
                    dimEl.className = "dimension-item";
                    dimEl.innerHTML = `
                        <span class="dimension-label">${dim.label || 'Dimension'}:</span>
                        <span class="dimension-value">${dim.value} ${dim.unit}</span>
                    `;
                    dimensionContainer.appendChild(dimEl);
                });
            } else {
                dimensionContainer.style.display = "none";
            }

            const tagContainer = card.querySelector(".tile-card__tags");
            tagContainer.innerHTML = "";
            if (page.cost) tagContainer.appendChild(buildTag("Cost", formatCost(page.cost)));
            if (page.perk) tagContainer.appendChild(buildTag("Status", page.perk));

            const imageContainer = card.querySelector(".tile-card__images");
            imageContainer.innerHTML = "";
            if (page.images?.length) {
                page.images.forEach((image) => {
                    const frame = document.createElement("div");
                    frame.className = "tile-image";
                    const img = document.createElement("img");
                    img.src = `${API_BASE}/${image.file_path}`;
                    img.alt = page.title;
                    frame.appendChild(img);

                    if (image.markers?.length) {
                        image.markers.forEach((marker) => {
                            const markerEl = document.createElement("span");
                            markerEl.className = "tile-marker";
                            markerEl.style.left = `${marker.x_percent}%`;
                            markerEl.style.top = `${marker.y_percent}%`;
                            markerEl.title = marker.label || "Marker";
                            frame.appendChild(markerEl);
                        });
                    }
                    frame.addEventListener("click", (event) => {
                        addMarker(image.id, frame, event);
                    });
                    imageContainer.appendChild(frame);
                });
            }

            const actions = card.querySelector(".tile-card__actions");
            actions.innerHTML = "";
            const editBtn = document.createElement("button");
            editBtn.className = "btn secondary small";
            editBtn.textContent = "Edit Page";
            editBtn.addEventListener("click", () => startEdit(page));
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn ghost small";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", () => deletePage(page.id));
            const dimensionBtn = document.createElement("button");
            dimensionBtn.className = "btn ghost small";
            dimensionBtn.textContent = "+ Dimension";
            dimensionBtn.addEventListener("click", () => addDimensionNote(page.id));
            actions.append(editBtn, dimensionBtn, deleteBtn);
            pageGrid.appendChild(card);
        });
    }

    function buildTag(label, value) {
        const pill = document.createElement("span");
        pill.className = "tile-tag";
        pill.textContent = `${label}: ${value}`;
        return pill;
    }

    function formatCost(value) {
        if (value === null || value === undefined || value === "") return "—";
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
        }).format(Number(value));
    }

    function formatPageMeta(page) {
        const timestamp = page.page_timestamp ? new Date(page.page_timestamp) : null;
        const dateText = timestamp ? timestamp.toLocaleString() : "No timestamp";
        return `${dateText} · ${page.images?.length || 0} images`;
    }

    function startEdit(page) {
        formTitle.textContent = "Edit Page";
        submitBtn.textContent = "Update Page";
        pageForm.dataset.mode = "edit";
        document.getElementById("page-id").value = page.id;
        pageForm.title.value = page.title;
        pageForm.note.value = page.note || "";
        pageForm.cost.value = page.cost ?? "";
        pageForm.perk.value = page.perk || "";
        if (page.page_timestamp) {
            const date = new Date(page.page_timestamp);
            pageForm.page_timestamp.value = date.toISOString().slice(0, 16);
        }
        pageForm.scrollIntoView({ behavior: "smooth", block: "center" });
        pageForm.title.focus();
    }

    function resetForm() {
        pageForm.reset();
        pageForm.dataset.mode = "create";
        document.getElementById("page-id").value = "";
        formTitle.textContent = "Create New Page";
        submitBtn.textContent = "Save Page";
    }

    cancelBtn?.addEventListener("click", resetForm);

    pageForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const mode = pageForm.dataset.mode || "create";
        const formData = new FormData(pageForm);
        formData.delete("pageId");
        if ((formData.get("title") || "").trim() === "") {
            showToast("Title is required", true);
            return;
        }
        let url = `${API_BASE}/books/${bookId}/pages`;
        let method = "POST";
        if (mode === "edit") {
            const pageId = document.getElementById("page-id").value;
            if (!pageId) {
                showToast("No tile selected", true);
                return;
            }
            url = `${API_BASE}/pages/${pageId}`;
            method = "PUT";
        }
        pageForm.reset();
        showToast(mode === "edit" ? "Page updated" : "Page added");
        resetForm();
        document.getElementById("page-images").value = "";
        loadBook();
    });

    async function deletePage(pageId) {
        if (!confirm("Are you sure you want to delete this page and all its notes?")) return;
        await safeFetch(`${API_BASE}/pages/${pageId}`, { method: "DELETE" });
        showToast("Page deleted");
        loadBook();
    }

    async function addDimensionNote(pageId) {
        const label = prompt("Dimension label (optional)", "");
        if (label === null) return;
        const value = prompt("Value (eg. 1200)", "");
        if (value === null) return;
        const unit = prompt("Unit (eg. mm)", "mm");
        if (unit === null) return;
        const context = prompt("Context (eg. tile width)", "");
        if (context === null) return;

        const formData = new FormData();
        formData.append("label", label);
        formData.append("value", value);
        formData.append("unit", unit);
        formData.append("context", context);

        await safeFetch(`${API_BASE}/pages/${pageId}/dimensions`, {
            method: "POST",
            body: formData,
        });
        showToast("Dimension note added");
        loadBook();
    }

    async function addMarker(imageId, frame, event) {
        const rect = frame.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        if (Number.isNaN(x) || Number.isNaN(y)) {
            return;
        }
        const label = prompt("Marker label", "");
        if (label === null) return;

        const formData = new FormData();
        formData.append("x_percent", x.toFixed(2));
        formData.append("y_percent", y.toFixed(2));
        formData.append("label", label);
        formData.append("dimension_note_id", "");

        await safeFetch(`${API_BASE}/images/${imageId}/markers`, {
            method: "POST",
            body: formData,
        });
        showToast("Marker added");
        loadBook();
    }

    refreshBtn?.addEventListener("click", loadBook);
    downloadBtn?.addEventListener("click", () => {
        window.location.href = `${API_BASE}/books/${bookId}/report.csv`;
    });
    downloadPdfBtn?.addEventListener("click", () => {
        showToast("PDF export will land in v1.1");
    });
    loadBook();
}

async function bootstrapAuth() {
    if (!state.user) {
        updateShellVisibility();
        return;
    }
    try {
        const user = await safeFetch(`${API_BASE}/me`, { muteErrors: true });
        if (user) {
            persistAuth(user, state.csrf, { silent: true });
        }
    } catch (error) {
        // handled by safeFetch
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
    if (page === "dashboard") {
        wireAuthForms();
        initDashboardPage();
    }
    if (page === "book-detail") {
        initBookDetailPage();
    }
}

document.addEventListener("DOMContentLoaded", init);
