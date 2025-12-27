# Architecture Notes App – Deep Dive

> These notes are meant to read like a mentoring session. Take your time, skim the diagrams first, and re-read the sections that match what you are coding today.

## 0. Milestone Log (Friendly Status Update)

**Today’s wins**
- FastAPI backend is live on your machine with SQLite + image uploads, so every click already writes to `notes.db`.
- Frontend pages (`index.html`, `category.html`) talk to the API through `frontend/app.js`; you proved it by running the static server and seeing categories load.
- SQLite is acting as our “real-time” storage: as soon as you save a row, SQLAlchemy commits it to the local file and the UI re-fetches the fresh data.

**What’s next**
- Tweak the UI (layout, states, extra hints) while keeping the same API contract.
- Once you’re happy visually, swap SQLite for a hosted database (Postgres on Render/Supabase/etc.) so deployment-friendly storage replaces the local file.

Keep updating this log each session so you can trace the learning journey like chapters in a studio sketchbook.

## 1. System Overview

```
+-----------------+         HTTP JSON / Multipart         +-------------------------+
|  Frontend (JS)  | <-----------------------------------> | FastAPI Backend (Python)|
|  Static files   |                                      |  SQLAlchemy + SQLite    |
+-----------------+         image bytes, JSON, IDs       +-------------------------+
                                                               |
                                                               | SQL queries via ORM
                                                               v
                                                         +--------------+
                                                         |  notes.db    |
                                                         +--------------+
```

- **frontend/** is a lightweight static site served by VS Code Live Server or any static server. It never talks directly to the database—only to the API.
- **backend/** exposes REST endpoints, saves uploaded files under `backend/uploads/`, and persists structured data in SQLite via SQLAlchemy models.
- **uploads/** keeps the actual image files. Database rows store only the relative path (`uploads/<file>.png`). FastAPI exposes them through `/uploads/...` so the browser can render them.

## 2. File-by-File Purpose

| File | Why it exists |
| --- | --- |
| `backend/database.py` | Creates the SQLite engine, the SQLAlchemy `Base`, and the `get_db()` dependency injected into every route. |
| `backend/models.py` | Declares `Category`, `Entry`, and `EntryImage` tables plus relationships (one category → many entries → many images). |
| `backend/schemas.py` | Pydantic response models that guarantee FastAPI returns predictable JSON to the browser. |
| `backend/main.py` | The FastAPI application: routes, image helpers, CRUD logic, and CORS/static-file setup. |
| `backend/uploads/.gitkeep` | Keeps the folder committed even when empty so image uploads have a place to live. |
| `frontend/index.html` | Landing page that lists every category and lets you create new ones. |
| `frontend/category.html` | Detail view with the editable table, image previews, and the entry form. |
| `frontend/styles.css` | Defines the visual language (warm neutral palette, Space Grotesk type, responsive layout). |
| `frontend/app.js` | Vanilla JS that fetches data, handles the forms, builds the tables, and calls image/entry APIs. |
| `requirements.txt` | Locked dependency list for the backend virtual environment. |
| `NOTES.md` & `STEPS.md` | Teaching material: this file explains the architecture; `STEPS.md` is a hands-on run guide. |

## 3. Frontend ↔ Backend Communication

| Action | HTTP Method & Endpoint | Payload | Response |
| --- | --- | --- | --- |
| List categories | `GET /categories` | none | Array of `{id, name, entry_count}` displayed on landing page. |
| Create category | `POST /categories` | JSON `{"name": "Furniture"}` | Newly created category JSON; page refreshes list. |
| Get category detail | `GET /categories/{id}` | none | `{id, name, entries:[...]}` used to build the table. |
| List entries only | `GET /categories/{id}/entries` | none | Used when you only need the rows. Frontend currently relies on detail endpoint, but both exist. |
| Create entry | `POST /categories/{id}/entries` | `multipart/form-data` (text fields + `images[]`) | Entry JSON with image URLs so the table updates instantly. |
| Update entry | `PUT /entries/{entry_id}` | `multipart/form-data` (same text fields, optional new images, `remove_image_ids`) | Updated entry JSON. |
| Delete entry | `DELETE /entries/{entry_id}` | none | `{"message": "Entry deleted"}`; UI removes the row. |
| Delete individual image | `DELETE /images/{image_id}` | none | `{"message": "Image deleted"}`; JS re-fetches the table. |
| Delete category | `DELETE /categories/{id}` | none | `{"message": "Category deleted"}` plus cascaded removal of its entries/images. |

**Why REST here?** Each action is clearly mapped to a verb, so you never wonder whether you need a custom RPC name. The browser-side code becomes predictable: inspect the verb and you already know what it will do.

## 4. How Data Flows (UI → Backend → Database)

1. **User fills a form** (e.g., new entry) in `category.html`.
2. **app.js** packages the fields into `FormData` so file uploads travel alongside text.
3. **Fetch → FastAPI:** the request hits `/categories/{id}/entries` (POST). FastAPI validates required fields and ensures the category exists.
4. **Database session:** the route function gets a `Session` from `get_db()`, builds an `Entry` model, and commits it. SQLAlchemy turns that into `INSERT` statements against `notes.db`.
5. **Images saved:** `_attach_images()` reads each `UploadFile`, stores it under `backend/uploads`, and writes a matching `EntryImage` row referencing the entry.
6. **Response serialization:** the entry is converted into an `EntryRead` schema so the JSON only contains friendly fields plus `/uploads/...` URLs.
7. **Browser update:** the promise resolves, JS re-fetches the category detail, and rebuilds the table, so you see the new row and thumbnails.

> Mental model: *Form → fetch → FastAPI route → SQLAlchemy session → SQLite file*. Once you rehearse that sentence a few times, debugging becomes easier because you know which hop to inspect.

## 5. HTTP Verb Cheat Sheet (Specific to This App)

- **GET** – *Read only.* Used for listing categories or fetching entries. No side effects.
- **POST** – *Create.* Adds new categories or entries. In this app, POSTs may carry JSON (categories) or multipart forms (entries with images).
- **PUT** – *Replace/update.* Updates an existing entry. We send the full current state of the entry (type, name, notes, etc.) plus optional new images.
- **DELETE** – *Remove.* Works for entries, images, and categories. DELETE endpoints also clean up files on disk so storage stays tidy.

## 6. Learning Path & Mentoring Notes

### Stage A – Backend Fundamentals
- **What you learn:** Python virtual environments, FastAPI routing, dependency injection, SQLAlchemy models/relationships.
- **Common mistakes:** forgetting to call `Base.metadata.create_all()`, not enabling `check_same_thread=False` for SQLite, or omitting `Form(...)` when the route expects multipart data.
- **Practice upgrade:** add a `PATCH /entries/{id}` endpoint that updates only one field to compare against PUT.

### Stage B – Database Thinking
- **What you learn:** one-to-many relationships (`Category -> Entry`, `Entry -> EntryImage`), cascading deletes, indexing for fast lookups.
- **Common mistakes:** deleting rows without cleaning up file storage or forgetting to refresh the SQLAlchemy instance after commits.
- **Practice upgrade:** add timestamps (`created_at`) and sort entries chronologically to understand default ordering.

> **SQLite today, hosted DB tomorrow:** Right now FastAPI points at `sqlite:///./notes.db`, which is perfect for local practice. When you deploy (Vercel, Render, etc.), switch that URL to a managed Postgres/MySQL service, install the matching driver, and copy the same SQLAlchemy models over. The rest of the code—and even the frontend—stays identical.

### Stage C – Frontend Consumption
- **What you learn:** DOM templating with `<template>`, FormData for file uploads, optimistic UI updates, error toasts.
- **Common mistakes:** not clearing `FormData` between edits, forgetting to append `remove_image_ids` when updating, or assuming fetch errors throw automatically (hence the `safeFetch` helper).
- **Practice upgrade:** build inline image preview before upload or add search/filtering on the entries table.

### Stage D – Architecture Awareness
- **What you learn:** separating concerns (database layer vs. schema vs. API vs. static UI), keeping endpoints resource-focused, and serving static files (images) via FastAPI’s `StaticFiles` mount.
- **Common mistakes:** mixing raw SQL queries scattered through route handlers or letting frontend hardcode DB logic. Keep layers talking only via APIs.
- **Practice upgrade:** introduce authentication (even a simple API token) to feel how each layer adapts.

## 7. Next Experiments

1. **Swap SQLite for PostgreSQL** – change the connection string in `database.py` and add environment variables. You will learn migrations and connection pooling.
2. **Add tagging or status fields** – extend the schema and observe how both backend and frontend must evolve together.
3. **Deploy locally with uvicorn + nginx** – understand why static files and API are often split into separate processes in production.

Keep iterating slowly. Each experiment should be small enough that you can still reason through the entire flow end-to-end. That ownership is what turns this study project into real backend intuition.
