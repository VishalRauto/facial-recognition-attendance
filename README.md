# FaceAttend — Smart Facial Recognition Attendance System

A full-stack attendance system using **OpenCV LBPH** face recognition, **Flask** backend, and a modern **vanilla JS** frontend. No dlib or face_recognition required — works on Python 3.9–3.14+.

## Features

- 🎯 **Face Recognition** — Haar Cascade detection + LBPH recognition
- 📸 **Multi-photo Registration** — Up to 5 photos per student for better accuracy
- 👁️ **Live Face Box Overlay** — Real-time green bounding box + liveness (eye) detection
- 📊 **Confidence Score** — Shows match % after every scan
- ✋ **Manual Attendance Override** — Mark students manually when needed
- 📈 **Analytics Dashboard** — Daily trend chart, pie chart, per-student % bars, weekly heatmap
- 🚫 **Absent Students List** — See who's missing at a glance
- 📁 **Export CSV / Excel / PDF** — One-click export of attendance records
- 🔍 **Search & Filter** — Search students by name/roll, filter by class
- 🏫 **Class & Subject Management** — Organize students by class and take subject-wise attendance
- 🔐 **Role-based Login** — Admin and Teacher roles (default: `admin` / `admin123`)
- 👥 **User Management** — Admin can create/delete teacher accounts
- 📝 **Audit Log** — Every action is logged with timestamp and user
- 🌙 **Dark / Light Mode** — Toggleable theme with localStorage persistence
- 📄 **Pagination** — Records table paginated at 20 per page

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Python 3.x, Flask, Flask-CORS     |
| Database | SQLite (via sqlite3)              |
| CV/ML    | OpenCV (opencv-contrib-python)    |
| Frontend | Vanilla JS, Chart.js, Font Awesome|

## Quick Start

### 1. Install dependencies
```bash
pip install flask flask-cors opencv-contrib-python numpy Pillow
```

### 2. Run the server
```bash
python app.py
```

### 3. Open browser
```
http://localhost:5000
```

Login with **admin / admin123**

## Project Structure

```
frs/
├── app.py              # Flask API server
├── database.py         # SQLite DB layer
├── face_engine.py      # OpenCV face detection & recognition
├── requirements.txt    # Python dependencies
├── frontend/
│   ├── index.html      # SPA shell
│   ├── app.js          # Frontend logic
│   └── style.css       # Dark/light themed styles
└── student_images/     # Student face photos (gitignored)
```

## Default Credentials

| Role    | Username | Password  |
|---------|----------|-----------|
| Admin   | admin    | admin123  |

> ⚠️ Change the default password before deploying.

## Notes

- `attendance.db` and `student_images/` are gitignored (contain biometric data)
- For production use, replace Flask's dev server with Gunicorn/uWSGI
- Change `app.secret_key` in `app.py` before deploying
