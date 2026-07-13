import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .database import Base, engine
from .routers import auth, users, leads, followups, activities, dashboard

load_dotenv()

# Creates tables on startup if they don't already exist.
# For a first deploy against a fresh Neon database this is sufficient;
# see README for how to run schema.sql manually instead if you prefer.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="LeadFlow API", version="1.0.0")

cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(leads.router)
app.include_router(followups.router)
app.include_router(activities.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
