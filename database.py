import sqlite3
import json
import os
from datetime import datetime, date

DB_PATH = 'attendance.db'

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_conn()
    c = conn.cursor()

    # ── Core tables ──────────────────────────────────────────────────────────
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'teacher',
            created_on TEXT DEFAULT (date('now'))
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            section TEXT,
            created_on TEXT DEFAULT (date('now'))
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            class_id INTEGER,
            FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE SET NULL
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            roll TEXT UNIQUE NOT NULL,
            encoding TEXT NOT NULL,
            image_path TEXT,
            class_id INTEGER,
            registered_on TEXT DEFAULT (date('now')),
            FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE SET NULL
        )
    ''')

    # Add class_id column if upgrading from old schema
    try:
        c.execute("ALTER TABLE students ADD COLUMN class_id INTEGER REFERENCES classes(id)")
    except Exception:
        pass

    c.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roll TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT,
            subject_id INTEGER,
            method TEXT DEFAULT 'face',
            UNIQUE(roll, date, subject_id),
            FOREIGN KEY(roll) REFERENCES students(roll),
            FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL
        )
    ''')

    # Add method column if upgrading
    try:
        c.execute("ALTER TABLE attendance ADD COLUMN method TEXT DEFAULT 'face'")
    except Exception:
        pass
    try:
        c.execute("ALTER TABLE attendance ADD COLUMN subject_id INTEGER REFERENCES subjects(id)")
    except Exception:
        pass

    c.execute('''
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            detail TEXT,
            performed_by TEXT DEFAULT 'system',
            timestamp TEXT DEFAULT (datetime('now','localtime'))
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS student_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roll TEXT NOT NULL,
            image_path TEXT NOT NULL,
            captured_on TEXT DEFAULT (date('now')),
            FOREIGN KEY(roll) REFERENCES students(roll) ON DELETE CASCADE
        )
    ''')

    # Seed default admin user (password: admin123)
    import hashlib
    default_pw = hashlib.sha256('admin123'.encode()).hexdigest()
    c.execute("INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?,?,?)",
              ('admin', default_pw, 'admin'))

    conn.commit()
    conn.close()

# ── Audit Log ────────────────────────────────────────────────────────────────

def add_audit(action, detail='', performed_by='system'):
    conn = get_conn()
    conn.execute(
        "INSERT INTO audit_log (action, detail, performed_by) VALUES (?,?,?)",
        (action, detail, performed_by)
    )
    conn.commit()
    conn.close()

def get_audit_log(limit=50):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ── Auth ──────────────────────────────────────────────────────────────────────

def verify_user(username, password):
    import hashlib
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    conn = get_conn()
    row = conn.execute(
        "SELECT id, username, role FROM users WHERE username=? AND password_hash=?",
        (username, pw_hash)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

def get_all_users():
    conn = get_conn()
    rows = conn.execute("SELECT id, username, role, created_on FROM users ORDER BY username").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_user(username, password, role='teacher'):
    import hashlib
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    conn = get_conn()
    c = conn.cursor()
    c.execute("INSERT INTO users (username, password_hash, role) VALUES (?,?,?)",
              (username, pw_hash, role))
    conn.commit()
    uid = c.lastrowid
    conn.close()
    return uid

def delete_user(user_id):
    conn = get_conn()
    conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    conn.commit()
    conn.close()

# ── Classes ───────────────────────────────────────────────────────────────────

def get_all_classes():
    conn = get_conn()
    rows = conn.execute(
        "SELECT c.*, COUNT(s.id) as student_count FROM classes c LEFT JOIN students s ON s.class_id=c.id GROUP BY c.id ORDER BY c.name"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_class(name, section=''):
    conn = get_conn()
    c = conn.cursor()
    c.execute("INSERT INTO classes (name, section) VALUES (?,?)", (name, section))
    conn.commit()
    cid = c.lastrowid
    conn.close()
    return cid

def delete_class(class_id):
    conn = get_conn()
    conn.execute("DELETE FROM classes WHERE id=?", (class_id,))
    conn.commit()
    conn.close()

# ── Subjects ──────────────────────────────────────────────────────────────────

def get_all_subjects():
    conn = get_conn()
    rows = conn.execute(
        "SELECT s.*, c.name as class_name FROM subjects s LEFT JOIN classes c ON c.id=s.class_id ORDER BY s.name"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_subject(name, class_id=None):
    conn = get_conn()
    c = conn.cursor()
    c.execute("INSERT INTO subjects (name, class_id) VALUES (?,?)", (name, class_id))
    conn.commit()
    sid = c.lastrowid
    conn.close()
    return sid

def delete_subject(subject_id):
    conn = get_conn()
    conn.execute("DELETE FROM subjects WHERE id=?", (subject_id,))
    conn.commit()
    conn.close()

# ── Students ──────────────────────────────────────────────────────────────────

def student_exists(roll):
    conn = get_conn()
    row = conn.execute('SELECT 1 FROM students WHERE roll=?', (roll,)).fetchone()
    conn.close()
    return row is not None

def add_student(name, roll, encoding, image_path, class_id=None):
    conn = get_conn()
    c = conn.cursor()
    c.execute(
        'INSERT INTO students (name, roll, encoding, image_path, class_id) VALUES (?,?,?,?,?)',
        (name, roll, json.dumps(encoding), image_path, class_id)
    )
    conn.commit()
    sid = c.lastrowid
    # Also register primary image in student_images table
    if image_path:
        conn.execute("INSERT INTO student_images (roll, image_path) VALUES (?,?)", (roll, image_path))
        conn.commit()
    conn.close()
    return sid

def add_student_image(roll, image_path):
    """Add an extra training image for an existing student."""
    conn = get_conn()
    conn.execute("INSERT INTO student_images (roll, image_path) VALUES (?,?)", (roll, image_path))
    conn.commit()
    conn.close()

def get_student_images(roll):
    conn = get_conn()
    rows = conn.execute("SELECT image_path FROM student_images WHERE roll=?", (roll,)).fetchall()
    conn.close()
    return [r['image_path'] for r in rows]

def delete_student(roll):
    conn = get_conn()
    conn.execute('DELETE FROM attendance WHERE roll=?', (roll,))
    conn.execute('DELETE FROM student_images WHERE roll=?', (roll,))
    conn.execute('DELETE FROM students WHERE roll=?', (roll,))
    conn.commit()
    conn.close()

def get_all_students():
    conn = get_conn()
    rows = conn.execute(
        '''SELECT s.id, s.name, s.roll, s.image_path, s.registered_on,
                  s.class_id, c.name as class_name, c.section
           FROM students s
           LEFT JOIN classes c ON c.id = s.class_id
           ORDER BY s.name'''
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_all_encodings():
    conn = get_conn()
    rows = conn.execute('SELECT roll, name, encoding FROM students').fetchall()
    conn.close()
    result = []
    for r in rows:
        result.append({
            'roll': r['roll'],
            'name': r['name'],
            'encoding': json.loads(r['encoding'])
        })
    return result

def update_student_class(roll, class_id):
    conn = get_conn()
    conn.execute("UPDATE students SET class_id=? WHERE roll=?", (class_id, roll))
    conn.commit()
    conn.close()

# ── Attendance ────────────────────────────────────────────────────────────────

def attendance_marked(roll, date_str, subject_id=None):
    conn = get_conn()
    if subject_id:
        row = conn.execute(
            'SELECT 1 FROM attendance WHERE roll=? AND date=? AND subject_id=?',
            (roll, date_str, subject_id)
        ).fetchone()
    else:
        row = conn.execute(
            'SELECT 1 FROM attendance WHERE roll=? AND date=? AND subject_id IS NULL',
            (roll, date_str)
        ).fetchone()
    conn.close()
    return row is not None

def mark_attendance(roll, date_str, time_str, subject_id=None, method='face'):
    conn = get_conn()
    conn.execute(
        'INSERT OR IGNORE INTO attendance (roll, date, time, subject_id, method) VALUES (?,?,?,?,?)',
        (roll, date_str, time_str, subject_id, method)
    )
    conn.commit()
    conn.close()

def get_attendance_by_date(date_str, subject_id=None):
    conn = get_conn()
    if subject_id:
        rows = conn.execute('''
            SELECT a.id, s.name, a.roll, a.date, a.time, a.method,
                   sub.name as subject_name
            FROM attendance a
            JOIN students s ON s.roll = a.roll
            LEFT JOIN subjects sub ON sub.id = a.subject_id
            WHERE a.date = ? AND a.subject_id = ?
            ORDER BY a.time
        ''', (date_str, subject_id)).fetchall()
    else:
        rows = conn.execute('''
            SELECT a.id, s.name, a.roll, a.date, a.time, a.method,
                   sub.name as subject_name
            FROM attendance a
            JOIN students s ON s.roll = a.roll
            LEFT JOIN subjects sub ON sub.id = a.subject_id
            WHERE a.date = ?
            ORDER BY a.time
        ''', (date_str,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_all_attendance():
    conn = get_conn()
    rows = conn.execute('''
        SELECT a.id, s.name, a.roll, a.date, a.time, a.method,
               sub.name as subject_name
        FROM attendance a
        JOIN students s ON s.roll = a.roll
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        ORDER BY a.date DESC, a.time DESC
    ''').fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_attendance_by_student(roll):
    conn = get_conn()
    rows = conn.execute('''
        SELECT a.id, s.name, a.roll, a.date, a.time, a.method,
               sub.name as subject_name
        FROM attendance a
        JOIN students s ON s.roll = a.roll
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        WHERE a.roll = ?
        ORDER BY a.date DESC
    ''', (roll,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_attendance_record(record_id):
    conn = get_conn()
    conn.execute("DELETE FROM attendance WHERE id=?", (record_id,))
    conn.commit()
    conn.close()

# ── Stats & Analytics ─────────────────────────────────────────────────────────

def get_stats():
    conn = get_conn()
    total_students = conn.execute('SELECT COUNT(*) FROM students').fetchone()[0]
    today = date.today().isoformat()
    present_today = conn.execute(
        'SELECT COUNT(DISTINCT roll) FROM attendance WHERE date=?', (today,)
    ).fetchone()[0]
    total_records = conn.execute('SELECT COUNT(*) FROM attendance').fetchone()[0]
    distinct_days = conn.execute(
        'SELECT COUNT(DISTINCT date) FROM attendance'
    ).fetchone()[0]
    absent_today = total_students - present_today
    conn.close()
    return {
        'total_students': total_students,
        'present_today': present_today,
        'absent_today': absent_today,
        'total_records': total_records,
        'distinct_days': distinct_days,
        'today': today
    }

def get_absent_today():
    today = date.today().isoformat()
    conn = get_conn()
    rows = conn.execute('''
        SELECT s.name, s.roll, c.name as class_name
        FROM students s
        LEFT JOIN classes c ON c.id = s.class_id
        WHERE s.roll NOT IN (
            SELECT DISTINCT roll FROM attendance WHERE date=?
        )
        ORDER BY s.name
    ''', (today,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_student_attendance_pct():
    """Return attendance % for every student."""
    conn = get_conn()
    total_days = conn.execute(
        'SELECT COUNT(DISTINCT date) FROM attendance'
    ).fetchone()[0]
    if total_days == 0:
        conn.close()
        return []
    rows = conn.execute('''
        SELECT s.roll, s.name, s.image_path,
               COUNT(a.id) as days_present
        FROM students s
        LEFT JOIN attendance a ON a.roll = s.roll
        GROUP BY s.roll
        ORDER BY s.name
    ''').fetchall()
    conn.close()
    result = []
    for r in rows:
        pct = round((r['days_present'] / total_days) * 100, 1) if total_days else 0
        result.append({
            'roll': r['roll'],
            'name': r['name'],
            'image_path': r['image_path'],
            'days_present': r['days_present'],
            'total_days': total_days,
            'percentage': pct
        })
    return result

def get_attendance_trend(days=30):
    """Daily attendance count for last N days."""
    conn = get_conn()
    rows = conn.execute('''
        SELECT date, COUNT(DISTINCT roll) as count
        FROM attendance
        WHERE date >= date('now', ?)
        GROUP BY date
        ORDER BY date
    ''', (f'-{days} days',)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_weekly_heatmap():
    """Attendance count grouped by day-of-week."""
    conn = get_conn()
    rows = conn.execute('''
        SELECT strftime('%w', date) as dow, COUNT(DISTINCT roll) as count
        FROM attendance
        GROUP BY dow
        ORDER BY dow
    ''').fetchall()
    conn.close()
    return [dict(r) for r in rows]
