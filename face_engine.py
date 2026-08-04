"""
face_engine.py
Pure-OpenCV face engine using:
  - Haar Cascade for detection
  - LBPH (Local Binary Pattern Histogram) for recognition
  - Multi-image training support (up to N images per student)
Works on Python 3.9 – 3.14+ without dlib / face_recognition.
"""

import cv2
import numpy as np
import os
import database as db

# ── Paths ─────────────────────────────────────────────────────────────────────
CASCADE_PATH = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
EYE_CASCADE_PATH = cv2.data.haarcascades + 'haarcascade_eye.xml'

face_cascade = cv2.CascadeClassifier(CASCADE_PATH)
eye_cascade  = cv2.CascadeClassifier(EYE_CASCADE_PATH)

_recognizer  = cv2.face.LBPHFaceRecognizer_create()
_label_map: dict[int, tuple[str, str]] = {}
_model_trained = False


# ── Internal helpers ──────────────────────────────────────────────────────────

def _bytes_to_bgr(img_bytes: bytes):
    """Decode image bytes → BGR numpy array."""
    np_arr = np.frombuffer(img_bytes, np.uint8)
    bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    return bgr

def _bytes_to_gray(img_bytes: bytes):
    bgr = _bytes_to_bgr(img_bytes)
    if bgr is None:
        return None
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

def _detect_faces_raw(gray):
    """Return list of (x,y,w,h) tuples."""
    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
    )
    if len(faces) == 0:
        return []
    return list(faces)

def _detect_face(gray):
    """Return the largest face ROI from a grayscale image, or None."""
    faces = _detect_faces_raw(gray)
    if not faces:
        return None
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    roi = gray[y:y+h, x:x+w]
    return cv2.resize(roi, (150, 150))

def _detect_face_with_box(gray):
    """Return (roi, (x,y,w,h)) for the largest face, or (None, None)."""
    faces = _detect_faces_raw(gray)
    if not faces:
        return None, None
    box = max(faces, key=lambda f: f[2] * f[3])
    x, y, w, h = box
    roi = gray[y:y+h, x:x+w]
    return cv2.resize(roi, (150, 150)), tuple(int(v) for v in box)

def _file_to_gray_roi(path: str):
    """Load a saved student image and return face ROI."""
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    faces = face_cascade.detectMultiScale(
        img, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
    )
    if len(faces) == 0:
        return cv2.resize(img, (150, 150))
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    roi = img[y:y+h, x:x+w]
    return cv2.resize(roi, (150, 150))


# ── Liveness helpers ──────────────────────────────────────────────────────────

def detect_blink_challenge(img_bytes: bytes):
    """
    Simple liveness check: returns True if eyes are detected in the face ROI
    (helps reject printed photos which often fail eye detection).
    """
    gray = _bytes_to_gray(img_bytes)
    if gray is None:
        return False
    faces = _detect_faces_raw(gray)
    if not faces:
        return False
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    roi = gray[y:y+h, x:x+w]
    eyes = eye_cascade.detectMultiScale(roi, scaleFactor=1.1, minNeighbors=5)
    return len(eyes) >= 2


# ── Public API ────────────────────────────────────────────────────────────────

def reload_known_faces():
    """Retrain LBPH recognizer from all registered student images (multi-image)."""
    global _recognizer, _label_map, _model_trained
    _label_map = {}
    _model_trained = False

    students = db.get_all_students()
    if not students:
        print("[face_engine] No students in DB – recognizer not trained.")
        return

    faces, labels = [], []
    for idx, s in enumerate(students):
        roll = s['roll']
        _label_map[idx] = (roll, s['name'])

        # Collect all images for this student
        all_paths = db.get_student_images(roll)
        # Fallback to primary image_path if no entries in student_images table
        if not all_paths and s.get('image_path'):
            all_paths = [s['image_path']]

        for path in all_paths:
            if not path or not os.path.exists(path):
                continue
            roi = _file_to_gray_roi(path)
            if roi is None:
                continue
            faces.append(roi)
            labels.append(idx)

    if not faces:
        print("[face_engine] No valid face images found.")
        return

    _recognizer = cv2.face.LBPHFaceRecognizer_create()
    _recognizer.train(faces, np.array(labels))
    _model_trained = True
    print(f"[face_engine] Trained on {len(faces)} image(s) across {len(set(labels))} student(s).")


def get_face_encoding_from_bytes(img_bytes: bytes):
    """
    Validate face presence. Returns [0.0] placeholder on success, None if no face.
    """
    gray = _bytes_to_gray(img_bytes)
    if gray is None:
        return None
    roi = _detect_face(gray)
    if roi is None:
        return None
    return [0.0]


def detect_face_box(img_bytes: bytes):
    """
    Detect the largest face and return its bounding box as a fraction of image size.
    Returns dict with x, y, w, h (0–1 range) and eyes_detected bool, or None.
    """
    bgr = _bytes_to_bgr(img_bytes)
    if bgr is None:
        return None
    h_img, w_img = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, box = _detect_face_with_box(gray)
    if box is None:
        return None
    x, y, w, h = box
    # Check eyes
    roi = gray[y:y+h, x:x+w]
    eyes = eye_cascade.detectMultiScale(roi, scaleFactor=1.1, minNeighbors=5)
    return {
        'x': x / w_img, 'y': y / h_img,
        'w': w / w_img, 'h': h / h_img,
        'eyes_detected': len(eyes) >= 2
    }


def identify_face(img_bytes: bytes, confidence_threshold: float = 80.0):
    """
    Identify a face from image bytes.
    Returns:
        None                        – no face detected
        'unknown'                   – face detected but confidence too low
        (roll, name, confidence%)   – matched student
    """
    if not _model_trained:
        reload_known_faces()
    if not _model_trained:
        return 'unknown'

    gray = _bytes_to_gray(img_bytes)
    if gray is None:
        return None

    roi, _ = _detect_face_with_box(gray)
    if roi is None:
        return None

    label, raw_conf = _recognizer.predict(roi)
    print(f"[face_engine] predict → label={label}, confidence={raw_conf:.1f}")

    # LBPH: lower = better; map to 0-100% confidence score
    conf_pct = max(0, round(100 - raw_conf, 1))

    if raw_conf < confidence_threshold:
        roll, name = _label_map.get(label, ('unknown', 'Unknown'))
        return roll, name, conf_pct

    return 'unknown'
