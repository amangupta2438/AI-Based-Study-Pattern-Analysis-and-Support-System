from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import pandas as pd
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="NeuroStudy API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---
class StudySession(BaseModel):
    subject: str
    duration_minutes: int
    focus_rating: int  # 1-10
    timestamp: datetime = datetime.now()
    notes: Optional[str] = None

class AnalysisResult(BaseModel):
    total_hours: float
    average_focus: float
    best_time_of_day: str
    suggestion: str

class RoadmapInput(BaseModel):
    subjects: List[str]
    start_hour: int  # 0-23
    end_hour: int    # 0-23

# --- In-Memory Database (for MVP) ---
study_sessions = []

# --- Endpoints ---

@app.get("/")
def read_root():
    return {"message": "NeuroStudy API is running"}

@app.post("/log_session", response_model=StudySession)
def log_session(session: StudySession):
    study_sessions.append(session)
    return session

@app.get("/sessions", response_model=List[StudySession])
def get_sessions():
    return study_sessions

@app.get("/analysis", response_model=AnalysisResult)
def get_analysis():
    if not study_sessions:
        return AnalysisResult(
            total_hours=0,
            average_focus=0,
            best_time_of_day="Not enough data",
            suggestion="Start logging your first study session!"
        )
    
    # Convert to DataFrame for analysis
    data = [s.dict() for s in study_sessions]
    df = pd.DataFrame(data)
    
    total_hours = df['duration_minutes'].sum() / 60
    avg_focus = df['focus_rating'].mean()
    
    # Simple Heuristic: Determine best time of day
    # In a real app, this would be more complex clustering
    df['hour'] = pd.to_datetime(df['timestamp']).dt.hour
    
    morning_focus = df[df['hour'] < 12]['focus_rating'].mean()
    afternoon_focus = df[(df['hour'] >= 12) & (df['hour'] < 18)]['focus_rating'].mean()
    evening_focus = df[df['hour'] >= 18]['focus_rating'].mean()
    
    times = {'Morning': morning_focus, 'Afternoon': afternoon_focus, 'Evening': evening_focus}
    # Filter out NaNs
    valid_times = {k: v for k, v in times.items() if pd.notna(v)}
    
    if valid_times:
        best_time = max(valid_times, key=valid_times.get)
    else:
        best_time = "Insufficient data"
        
    # Generate Suggestion
    if avg_focus < 5:
        suggestion = "Your focus is low. Try the Pomodoro technique (25min work, 5min break)."
    elif avg_focus > 8:
        suggestion = "Great focus! Keep up the momentum, but don't forget to hydrate."
    else:
        suggestion = f"You perform best in the {best_time}. Try to schedule difficult subjects then."

    return AnalysisResult(
        total_hours=round(total_hours, 2),
        average_focus=round(avg_focus, 1),
        best_time_of_day=best_time,
        suggestion=suggestion
    )

@app.post("/generate_roadmap")
def generate_roadmap(data: RoadmapInput):
    available_hours = data.end_hour - data.start_hour
    if available_hours <= 0:
        return {"error": "Start time must be before end time"}
    
    if not data.subjects:
        return {"error": "Please provide at least one subject"}

    # Logic with Breaks
    num_subjects = len(data.subjects)
    if num_subjects > 1:
        # 15 min break between subjects
        break_duration = 0.25 
        total_break_time = (num_subjects - 1) * break_duration
        
        # Ensure we don't consume all time with breaks
        if total_break_time >= available_hours * 0.5:
            break_duration = 0 # Skip breaks if tight schedule
            total_break_time = 0
            
        study_time = available_hours - total_break_time
        hours_per_subject = study_time / num_subjects
    else:
        break_duration = 0
        hours_per_subject = available_hours

    roadmap = []
    current_time = data.start_hour
    
    # Helper for formatting
    def format_12h(t):
        h = int(t)
        m = int((t%1)*60)
        suffix = "AM" if h < 12 else "PM"
        h_disp = h if h <= 12 else h - 12
        if h_disp == 0: h_disp = 12
        return f"{h_disp}:{m:02d} {suffix}"

    for i, subject in enumerate(data.subjects):
        end_time = current_time + hours_per_subject
        
        # Focus Logic
        hour_check = current_time % 24
        if 6 <= hour_check < 12:
            intensity = "High Focus"
            tip = " tackle complex concepts now."
        elif 12 <= hour_check < 17:
            intensity = "Medium Focus"
            tip = " review notes or do practice problems."
        elif 17 <= hour_check < 22:
            intensity = "High Focus" 
            tip = " great time for memorization."
        else:
            intensity = "Low Focus"
            tip = " light reading or organization."

        roadmap.append({
            "start_time": current_time,
            "end_time": end_time,
            "time_range": f"{format_12h(current_time)} - {format_12h(end_time)}",
            "subject": subject,
            "focus_level": intensity,
            "tip": f"Start with {subject}, {tip}"
        })
        
        current_time = end_time
        
        # Add Break if not last item
        if i < num_subjects - 1 and break_duration > 0:
            break_end = current_time + break_duration
            roadmap.append({
                "start_time": current_time,
                "end_time": break_end,
                "time_range": f"{format_12h(current_time)} - {format_12h(break_end)}",
                "subject": "Break",
                "focus_level": "Rest",
                "tip": "Stretch, hydrate, or take a quick walk."
            })
            current_time = break_end

    return {"roadmap": roadmap, "total_hours": available_hours}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
