# MetaGuard - AI-Based Upload Monitoring & Duplicate Detection Platform

MetaGuard is a comprehensive web platform built to monitor uploaded content, detect exact and similar duplicates using AI, extract metadata, and visualize analytics through an intuitive dashboard.

## Features
- **File Upload System:** Supports images, PDFs, text, audio, and video files (up to 50MB).
- **Duplicate Detection:** Exact match via SHA256 hashing and similar content detection using ChromaDB, perceptual hashing (phash), and sentence transformers.
- **Metadata Extraction:** Extracts file size, format, dimensions, duration, and other attributes automatically.
- **Dashboard Analytics:** Visualizes upload trends, duplicates, and file types using Recharts.
- **Authentication:** Secure JWT-based user authentication.
- **Modern UI:** Built with Next.js App Router, Tailwind CSS, shadcn/ui, featuring dark mode, glassmorphism, and smooth animations.

## Prerequisites
- Docker (for PostgreSQL)
- Node.js (v18+)
- Python 3.9+

## Setup Instructions

### 1. Database Setup
Start the PostgreSQL database using Docker:
```bash
docker-compose up -d
```

### 2. Backend Setup
Navigate to the backend directory, create a virtual environment, and install dependencies:
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
```
Start the FastAPI server:
```bash
uvicorn main:app --reload
```
The backend API will be available at `http://localhost:8000`.

### 3. Frontend Setup
Navigate to the frontend directory and install dependencies:
```bash
cd frontend
npm install
```
Start the Next.js development server:
```bash
npm run dev
```
The frontend will be available at `http://localhost:3000`.

## Tech Stack
- **Frontend:** Next.js, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend:** FastAPI, SQLAlchemy, PostgreSQL, JWT Authentication
- **AI/Processing:** Pillow, OpenCV, imagehash, sentence-transformers, ChromaDB
