from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
import os
import base64
import json
from datetime import date, datetime
import database as db
import face_engine as fe

app = Flask(__name__, static_folder='frontend', static_url_path='')
app.secret_key = 'faceattend-secret-2024-change-in-prod'
CORS(app, supports_credentials=True)

# Ensure folders exist
os.makedirs('student_images', exist_ok=True)
os.makedirs('frontend', exist_ok=True)

db.init_db()
fe.reload_known_faces()

# ─── Auth helpers ──────────────────────────────────────────────────────────────

def current_user():
    return session.get('user')

def require_auth(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

def require_admin(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        u = session.get('user')
        if not u:
            return jsonify({'error': 'Unauthorized'}), 401
        if u.get('role') != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated

# ─── Serve Frontend ────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('frontend', path)

# ─── Auth ──────────────────────────────────────────────────────────────────────

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = db.verify_user(data.get('username',''), data.get('password',''))
    if not user:
        return jsonify({'error': 'Invalid username or password'}), 401
    session['user'] = user
    db.add_audit('LOGIN', f"User {user['username']} logged in")
    return jsonify({'message': 'Login successful', 'user': user})

@app.route('/api/logout', methods=['POST'])
def logout():
    u = session.pop('user', None)
    if u:
        db.add_audit('LOGOUT', f"User {u['username']} logged out")
    return jsonify({'message': 'Logged out'})

@app.route('/api/me', methods=['GET'])
def me():
    u = current_user()
    if not u:
        return jsonify({'user': None})
    return jsonify({'user': u})

# ─── User Management (admin only) ─────────────────────────────────────────────

@app.route('/api/users', methods=['GET'])
@require_admin
def get_users():
    return jsonify(db.get_all_users())

@app.route('/api/users', methods=['POST'])
@require_admin
def create_user():
    data = request.json
    username = data.get('username','').strip()
    password = data.get('password','').strip()
    role = data.get('role', 'teacher')
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    try:
        uid = db.add_user(username, password, role)
        db.add_audit('CREATE_USER', f"Created user {username} ({role})", current_user().get('username',''))
        return jsonify({'message': f'User {username} created', 'id': uid}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 409

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@require_admin
def delete_user(user_id):
    db.delete_user(user_id)
    db.add_audit('DELETE_USER', f"Deleted user id={user_id}", current_user().get('username',''))
    return jsonify({'message': 'User deleted'})

# ─── Classes ───────────────────────────────────────────────────────────────────

@app.route('/api/classes', methods=['GET'])
def get_classes():
    return jsonify(db.get_all_classes())

@app.route('/api/classes', methods=['POST'])
@require_auth
def create_class():
    data = request.json
    name = data.get('name','').strip()
    section = data.get('section','').strip()
    if not name:
        return jsonify({'error': 'Class name required'}), 400
    cid = db.add_class(name, section)
    db.add_audit('CREATE_CLASS', f"Class '{name}' section '{section}'", current_user().get('username',''))
    return jsonify({'message': f'Class {name} created', 'id': cid}), 201

@app.route('/api/classes/<int:class_id>', methods=['DELETE'])
@require_auth
def delete_class(class_id):
    db.delete_class(class_id)
    db.add_audit('DELETE_CLASS', f"Deleted class id={class_id}", current_user().get('username',''))
    return jsonify({'message': 'Class deleted'})

# ─── Subjects ──────────────────────────────────────────────────────────────────

@app.route('/api/subjects', methods=['GET'])
def get_subjects():
    return jsonify(db.get_all_subjects())

@app.route('/api/subjects', methods=['POST'])
@require_auth
def create_subject():
    data = request.json
    name = data.get('name','').strip()
    class_id = data.get('class_id') or None
    if not name:
        return jsonify({'error': 'Subject name required'}), 400
    sid = db.add_subject(name, class_id)
    db.add_audit('CREATE_SUBJECT', f"Subject '{name}'", current_user().get('username',''))
    return jsonify({'message': f'Subject {name} created', 'id': sid}), 201

@app.route('/api/subjects/<int:subject_id>', methods=['DELETE'])
@require_auth
def delete_subject(subject_id):
    db.delete_subject(subject_id)
    return jsonify({'message': 'Subject deleted'})

# ─── Students ──────────────────────────────────────────────────────────────────

@app.route('/api/students', methods=['GET'])
def get_students():
    students = db.get_all_students()
    return jsonify(students)

@app.route('/api/students', methods=['POST'])
def register_student():
    data = request.json
    name = data.get('name', '').strip()
    roll = data.get('roll', '').strip()
    images_b64 = data.get('images', [])   # list of base64 strings
    class_id   = data.get('class_id') or None

    # backward compat: single 'image' field
    single = data.get('image')
    if single and not images_b64:
        images_b64 = [single]

    if not name or not roll or not images_b64:
        return jsonify({'error': 'Name, roll number and at least one image are required'}), 400

    if db.student_exists(roll):
        return jsonify({'error': f'Roll number {roll} already registered'}), 409

    saved_paths = []
    primary_path = None

    for i, img_b64 in enumerate(images_b64):
        img_bytes = base64.b64decode(img_b64.split(',')[-1])
        encoding = fe.get_face_encoding_from_bytes(img_bytes)
        if encoding is None and i == 0:
            return jsonify({'error': 'No face detected in the first image. Please retake.'}), 400

        img_path = f'student_images/{roll}_{i}.jpg'
        with open(img_path, 'wb') as f:
            f.write(img_bytes)
        saved_paths.append(img_path)
        if i == 0:
            primary_path = img_path

    enc_list = [0.0]
    student_id = db.add_student(name, roll, enc_list, primary_path, class_id)

    # Register extra images
    for extra in saved_paths[1:]:
        db.add_student_image(roll, extra)

    fe.reload_known_faces()
    db.add_audit('REGISTER_STUDENT', f"Registered {name} ({roll}) with {len(saved_paths)} image(s)",
                 current_user().get('username', 'system') if current_user() else 'system')
    return jsonify({'message': f'Student {name} registered with {len(saved_paths)} photo(s)', 'id': student_id}), 201

@app.route('/api/students/<roll>/photo', methods=['GET'])
def student_photo(roll):
    """Serve the student's primary photo."""
    students = db.get_all_students()
    student = next((s for s in students if s['roll'] == roll), None)
    if not student or not student.get('image_path'):
        return jsonify({'error': 'Photo not found'}), 404
    path = student['image_path']
    directory = os.path.dirname(os.path.abspath(path))
    filename = os.path.basename(path)
    return send_from_directory(directory, filename)

@app.route('/api/students/<roll>', methods=['DELETE'])
@require_auth
def delete_student(roll):
    if not db.student_exists(roll):
        return jsonify({'error': 'Student not found'}), 404
    # Remove all saved images
    images = db.get_student_images(roll)
    for path in images:
        if os.path.exists(path):
            os.remove(path)
    db.delete_student(roll)
    fe.reload_known_faces()
    db.add_audit('DELETE_STUDENT', f"Deleted student {roll}", current_user().get('username',''))
    return jsonify({'message': 'Student deleted successfully'})

@app.route('/api/students/<roll>/class', methods=['PUT'])
@require_auth
def update_student_class(roll):
    data = request.json
    class_id = data.get('class_id')
    db.update_student_class(roll, class_id)
    return jsonify({'message': 'Class updated'})

@app.route('/api/students/attendance-pct', methods=['GET'])
def student_attendance_pct():
    return jsonify(db.get_student_attendance_pct())

# ─── Attendance ────────────────────────────────────────────────────────────────

@app.route('/api/mark-attendance', methods=['POST'])
def mark_attendance():
    data = request.json
    image_b64  = data.get('image')
    subject_id = data.get('subject_id') or None
    if not image_b64:
        return jsonify({'error': 'Image required'}), 400

    img_bytes = base64.b64decode(image_b64.split(',')[-1])
    result = fe.identify_face(img_bytes)

    if result is None:
        return jsonify({'status': 'no_face', 'message': 'No face detected'}), 200

    if result == 'unknown':
        return jsonify({'status': 'unknown', 'message': 'Face not recognized'}), 200

    roll, name, confidence = result
    today = date.today().isoformat()

    if db.attendance_marked(roll, today, subject_id):
        return jsonify({
            'status': 'already_marked',
            'message': f'{name} ({roll}) — already marked for today',
            'name': name, 'roll': roll, 'confidence': confidence
        }), 200

    db.mark_attendance(roll, today, datetime.now().strftime('%H:%M:%S'), subject_id, 'face')
    db.add_audit('MARK_ATTENDANCE', f"{name} ({roll}) face-detected, conf={confidence}%")
    return jsonify({
        'status': 'marked',
        'message': f'Attendance marked for {name} ({roll})',
        'name': name, 'roll': roll, 'confidence': confidence
    }), 200

@app.route('/api/mark-attendance/manual', methods=['POST'])
@require_auth
def manual_attendance():
    data = request.json
    roll = data.get('roll','').strip()
    date_str = data.get('date', date.today().isoformat())
    subject_id = data.get('subject_id') or None

    if not roll:
        return jsonify({'error': 'Roll number required'}), 400
    if not db.student_exists(roll):
        return jsonify({'error': 'Student not found'}), 404

    if db.attendance_marked(roll, date_str, subject_id):
        return jsonify({'error': 'Attendance already marked for this date'}), 409

    db.mark_attendance(roll, date_str, datetime.now().strftime('%H:%M:%S'), subject_id, 'manual')
    db.add_audit('MANUAL_ATTENDANCE', f"Manual mark for {roll} on {date_str}",
                 current_user().get('username',''))
    return jsonify({'message': f'Manual attendance marked for {roll} on {date_str}'}), 200

@app.route('/api/attendance/<int:record_id>', methods=['DELETE'])
@require_auth
def delete_attendance(record_id):
    db.delete_attendance_record(record_id)
    db.add_audit('DELETE_ATTENDANCE', f"Deleted attendance record id={record_id}",
                 current_user().get('username',''))
    return jsonify({'message': 'Record deleted'})

@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    query_date = request.args.get('date', date.today().isoformat())
    subject_id = request.args.get('subject_id') or None
    records = db.get_attendance_by_date(query_date, subject_id)
    return jsonify(records)

@app.route('/api/attendance/all', methods=['GET'])
def get_all_attendance():
    records = db.get_all_attendance()
    return jsonify(records)

@app.route('/api/attendance/student/<roll>', methods=['GET'])
def get_student_attendance(roll):
    records = db.get_attendance_by_student(roll)
    return jsonify(records)

@app.route('/api/attendance/absent-today', methods=['GET'])
def absent_today():
    return jsonify(db.get_absent_today())

# ─── Stats & Analytics ─────────────────────────────────────────────────────────

@app.route('/api/stats', methods=['GET'])
def get_stats():
    return jsonify(db.get_stats())

@app.route('/api/analytics/trend', methods=['GET'])
def analytics_trend():
    days = int(request.args.get('days', 30))
    return jsonify(db.get_attendance_trend(days))

@app.route('/api/analytics/heatmap', methods=['GET'])
def analytics_heatmap():
    return jsonify(db.get_weekly_heatmap())

# ─── Face Detection (for live overlay) ────────────────────────────────────────

@app.route('/api/detect-face', methods=['POST'])
def detect_face():
    data = request.json
    image_b64 = data.get('image')
    if not image_b64:
        return jsonify({'box': None}), 200
    img_bytes = base64.b64decode(image_b64.split(',')[-1])
    box = fe.detect_face_box(img_bytes)
    return jsonify({'box': box})

# ─── Audit Log ─────────────────────────────────────────────────────────────────

@app.route('/api/audit', methods=['GET'])
@require_auth
def get_audit():
    limit = int(request.args.get('limit', 50))
    return jsonify(db.get_audit_log(limit))

if __name__ == '__main__':
    print("Starting FaceAttend server at http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
