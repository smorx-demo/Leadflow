# LeadFlow — Lead Management & Sales Tracking

A full-stack lead management platform: role-based dashboards (Super Admin / Individual User),
pipeline tracking, follow-up management with overdue alerts, and a full activity/audit log.

**Stack**
- Backend: **Python** (FastAPI) + SQLAlchemy, JWT auth
- Database: **PostgreSQL** (built and tested against **Neon**)
- Frontend: Vanilla HTML/CSS/JS single-page app (no build step — deploys as static files, works great on mobile)

This was built and smoke-tested end-to-end in the sandbox (login, RBAC, lead/follow-up CRUD,
both dashboards) against a local Postgres instance before being handed to you. You still need to
point it at your own Neon database and deploy it — see below.

---

## 1. Project layout

```
leadflow/
  backend/
    app/
      main.py          # FastAPI app + startup table creation
      database.py       # Neon/Postgres connection
      models.py         # SQLAlchemy models (users, leads, followups, activities)
      schemas.py         # Pydantic request/response schemas
      auth.py            # password hashing + JWT
      deps.py             # current-user / admin-only dependencies
      routers/            # auth, users, leads, followups, activities, dashboard
    schema.sql            # reference SQL (tables are auto-created by the app on boot)
    seed.py                # creates first super admin + sample data
    requirements.txt
    .env.example
  frontend/
    index.html            # login page
    app.html                # SPA shell (dashboard/leads/followups/activity/users)
    css/style.css
    js/{config.js, api.js, app.js}
```

## 2. Set up your Neon database

1. Create a free project at [neon.tech](https://neon.tech).
2. In the Neon console, open **Connection Details** and copy the connection string
   (it looks like `postgresql://<user>:<password>@<host>/<dbname>?sslmode=require`).
3. That's it — you don't need to run `schema.sql` manually. The backend creates all
   tables automatically on first startup. (`schema.sql` is included for reference or
   if you prefer to provision the schema yourself / use a migration tool later.)

## 3. Run the backend locally

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env:
#   - DATABASE_URL = your Neon connection string
#   - JWT_SECRET   = generate with: python -c "import secrets; print(secrets.token_hex(32))"
#   - FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD = your real admin login

python seed.py                  # creates tables, first super admin, and sample data
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive API docs (Swagger UI).

**First super admin account:** created by `seed.py` from `FIRST_ADMIN_EMAIL` /
`FIRST_ADMIN_PASSWORD` in `.env` (defaults to `admin@leadflow.com` / `ChangeMe123!`
if left unset — **change this before going live**). `seed.py` is safe to re-run; it
won't duplicate the admin account, and only adds sample leads if the leads table is
still empty.

Sample data also creates two individual-user demo logins:
`alex@leadflow.com` / `Consultant123!` and `jordan@leadflow.com` / `Partner123!`,
each with ~14 sample leads, follow-ups (including some intentionally overdue, to
demonstrate the alerting), and activity history. Delete these accounts from the
Users tab once you're ready to load real data.

## 4. Run the frontend locally

The frontend is static — no build step. Easiest way to serve it locally:

```bash
cd frontend
python -m http.server 5500
```

Visit `http://localhost:5500`. `js/config.js` already points to `http://localhost:8000/api`
when running on `localhost`, so login should work immediately against your local backend.

## 5. Deploy to the cloud

### Backend (Render — free tier available; Railway/Fly.io work the same way)

1. Push this repo to GitHub.
2. In [Render](https://render.com): **New → Web Service**, connect the repo, set the root
   directory to `backend`.
3. Build command: `pip install -r requirements.txt`
   Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables (from `.env.example`): `DATABASE_URL`, `JWT_SECRET`,
   `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `CORS_ORIGINS` (set this to your
   deployed frontend URL once you have it, e.g. `https://leadflow.netlify.app`),
   `FIRST_ADMIN_NAME`, `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_PASSWORD`.
5. Deploy. Then run the seed script once against production — easiest options:
   - Render's **Shell** tab on the service: `python seed.py`
   - Or temporarily add `python seed.py &&` in front of your start command for the
     first deploy only, then remove it (seed.py is idempotent, so leaving it in
     permanently is also safe — it just does nothing on later deploys).
6. Your API is now live at `https://your-service.onrender.com`. Confirm with
   `GET /api/health`.

*(AWS/Heroku/DigitalOcean App Platform work the same way — set `DATABASE_URL` and
the other env vars, run `uvicorn app.main:app --host 0.0.0.0 --port $PORT` as the
start command.)*

### Frontend (Netlify, Vercel, or any static host — or Render Static Site)

1. Edit `frontend/js/config.js` — replace the placeholder with your real backend URL:
   ```js
   : 'https://your-service.onrender.com/api';
   ```
2. Deploy the `frontend/` folder as a static site (Netlify/Vercel: drag-and-drop the
   folder, or connect the repo with publish directory `frontend`, no build command).
3. Go back to your backend's `CORS_ORIGINS` env var and set it to this frontend URL,
   then redeploy the backend.
4. Visit your frontend URL, log in with your admin account, and you're live.

## 6. Creating additional users

Once logged in as super admin, go to **Users → + Add user** to create individual
logins (Consultant, Partner, etc.) and assign roles. Deactivating a user immediately
blocks their login while preserving their historical leads and activity for reporting.

## 7. How RBAC is enforced

Every leads/follow-ups/activities endpoint filters by `owner_id` at the database query
level for non-admin users — individual users can never fetch, edit, or see another
user's leads, even by guessing an ID (`403` is returned). Only `super_admin`-role users
can hit `/api/dashboard/admin` and the `/api/users` management endpoints.

## 8. What to build next (not included)

- Password reset / "forgot password" flow (currently admin resets passwords manually)
- Email/SMS notifications for overdue follow-ups
- CSV import/export for bulk lead migration from Excel
- Custom fields (the brief mentions filtering by "custom fields" — the schema is
  intentionally simple today; adding a `custom_fields JSONB` column to `leads` is the
  natural extension point)
