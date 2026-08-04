@echo off
echo ========================================
echo   FaceAttend - Setup
echo ========================================
echo.

echo [1/3] Creating virtual environment...
python -m venv venv
call venv\Scripts\activate.bat

echo.
echo [2/3] Installing dependencies...
echo NOTE: dlib and face_recognition may take a few minutes...
pip install flask flask-cors numpy Pillow opencv-python
pip install cmake
pip install dlib
pip install face-recognition

echo.
echo [3/3] Setup complete!
echo.
echo To start the server run:  run.bat
pause
