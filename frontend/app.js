const API_BASE = "http://127.0.0.1:8000";

const toastEl = document.getElementById("toast");

function showToast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.style.background = isError ? "#b3261e" : "#026670";
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2600);
}

async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            const message = detail?.detail || detail?.message || "Request failed";
            throw new Error(message);
        }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            return response.json();
        }
        return response;
    } catch (error) {
        showToast(error.message, true);
        throw error;
    }
}

function initCategoriesPage() {
    const listEl = document.getElementById("category-list");
    const formEl = document.getElementById("category-form");
    const template = document.getElementById("category-card-template");
    const refreshBtn = document.getElementById("refresh-categories");

    async function loadCategories() {
        listEl.innerHTML = "<p class='empty-state'>Loading...</p>";
        const categories = await safeFetch(`${API_BASE}/categories`);
        if (!categories.length) {
            listEl.innerHTML = "<p class='empty-state'>No categories yet. Start by adding one.</p>";
            return;
        }
        listEl.innerHTML = "";
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

    loadCategories();
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

function init() {
    const page = document.body.dataset.page;
    if (page === "categories") {
        initCategoriesPage();
    }
    if (page === "category-detail") {
        initCategoryDetailPage();
    }
}

document.addEventListener("DOMContentLoaded", init);
