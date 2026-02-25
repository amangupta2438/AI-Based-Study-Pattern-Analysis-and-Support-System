const API_URL = "http://localhost:8000";

// --- Navigation ---
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');

    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    // Simple way to highlight correct nav item
    const navIndex = ['dashboard', 'logger', 'insights'].indexOf(sectionId);
    if (navIndex >= 0) {
        document.querySelectorAll('.sidebar li')[navIndex].classList.add('active');
    }

    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'insights') fetchAnalysis();

    // Reset wizard when leaving tab
    if (sectionId !== 'roadmap' && document.getElementById('step-1')) {
        resetWizard();
    }
}

// --- Roadmap Wizard Logic ---
let wizardData = {
    count: 0,
    subjects: [],
    start: 0,
    end: 0
};

function wizardNext(step) {
    if (step === 1) {
        const count = parseInt(document.getElementById('subject-count').value);
        if (!count || count < 1) return alert("Please enter a valid number (1-10)");

        wizardData.count = count;

        // Generate inputs for step 2
        const container = document.getElementById('subject-inputs-container');
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            container.innerHTML += `<input type="text" class="wizard-sub-input" placeholder="Subject ${i + 1} Name" required>`;
        }

        transitionStep('step-1', 'step-2');
    }
    else if (step === 2) {
        // Collect subjects
        const inputs = document.querySelectorAll('.wizard-sub-input');
        let valid = true;
        wizardData.subjects = [];
        inputs.forEach(inp => {
            if (!inp.value) valid = false;
            wizardData.subjects.push(inp.value);
        });

        if (!valid) return alert("Please fill all subject names");

        transitionStep('step-2', 'step-3');
    }
}

function transitionStep(currentId, nextId) {
    document.getElementById(currentId).classList.add('hidden');
    const next = document.getElementById(nextId);
    next.classList.remove('hidden');
    next.classList.add('step-enter');
}

function resetWizard() {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
    document.getElementById('step-1').classList.remove('hidden');
    document.getElementById('roadmap-display').classList.add('hidden');
    document.getElementById('subject-count').value = '';
}

async function submitWizard() {
    // Helper to convert 12h to 24h
    const get24h = (h, ampm) => {
        h = parseInt(h);
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return h;
    };

    const startH = document.getElementById('start-hour').value;
    const startM = document.getElementById('start-ampm').value;
    const endH = document.getElementById('end-hour').value;
    const endM = document.getElementById('end-ampm').value;

    const start = get24h(startH, startM);
    const end = get24h(endH, endM);

    // Validate
    if (start >= end) return alert("Start time must be before end time! (e.g. 6 PM to 10 PM)");

    try {
        const res = await fetch(`${API_URL}/generate_roadmap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subjects: wizardData.subjects,
                start_hour: start,
                end_hour: end
            })
        });

        const data = await res.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        // Render Result
        const container = document.getElementById('roadmap-display');
        container.classList.remove('hidden');
        document.getElementById('roadmap-wizard').classList.add('hidden'); // Hide wizard

        // 1. Render Timeline Chart
        container.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1rem; color: #4e54c8;">Your Study Timeline</h3>
                <div style="height: 250px;">
                    <canvas id="roadmapChart"></canvas>
                </div>
            </div>
            <div id="roadmap-details"></div>
            <button onclick="resetWizard(); document.getElementById('roadmap-wizard').classList.remove('hidden');" class="btn-secondary" style="width:100%; margin-top:2rem;">Create New Roadmap</button>
        `;

        renderRoadmapChart(data.roadmap);
        renderRoadmapDetails(data.roadmap);

    } catch (err) {
        console.error(err);
        alert("Failed to generate roadmap.");
    }
}

function renderRoadmapChart(roadmap) {
    const ctx = document.getElementById('roadmapChart').getContext('2d');

    // Prepare Data for Floating Bar Chart
    const labels = roadmap.map(i => i.subject);
    const data = roadmap.map(i => [i.start_time, i.end_time]);
    const backgroundColors = roadmap.map((item, i) => {
        if (item.subject === 'Break') return '#b2bec3'; // Grey for breaks
        const colors = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3'];
        return colors[i % colors.length];
    });

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Study Duration',
                data: data,
                backgroundColor: backgroundColors,
                borderRadius: 10,
                barThickness: 30
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal Bar Chart (Gantt style)
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    min: Math.floor(roadmap[0].start_time),
                    max: Math.ceil(roadmap[roadmap.length - 1].end_time),
                    title: { display: true, text: 'Time (24h Clock)' },
                    grid: { color: '#f0f0f0' }
                },
                y: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const raw = context.raw;
                            return `Time: ${formatTime(raw[0])} - ${formatTime(raw[1])}`;
                        }
                    }
                }
            }
        }
    });
}

function formatTime(decimalTime) {
    const h = Math.floor(decimalTime);
    const m = Math.round((decimalTime - h) * 60);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hDisp = h > 12 ? h - 12 : (h === 0 || h === 24 ? 12 : h);
    return `${hDisp}:${m.toString().padStart(2, '0')} ${suffix}`;
}

function renderRoadmapDetails(roadmap) {
    let html = `<h4 style="margin-bottom:1rem; color:#636e72;">Detailed Plan</h4>`;
    html += `<div style="display: grid; gap: 1rem;">`;

    roadmap.forEach(item => {
        const isBreak = item.subject === 'Break';
        const bg = isBreak ? '#f5f6fa' : 'white';
        const border = isBreak ? '2px dashed #b2bec3' : '1px solid #e9ecef';
        const icon = isBreak ? '☕' : '💡';
        const titleColor = isBreak ? '#636e72' : '#2d3436';

        html += `
            <div style="background: ${bg}; padding: 1.2rem; border-radius: 12px; border: ${border}; display: flex; align-items: start; gap: 1rem;">
                <div style="background: rgba(108, 92, 231, 0.1); color: #6c5ce7; font-weight: bold; padding: 0.5rem 1rem; border-radius: 8px; white-space: nowrap;">
                    ${item.time_range}
                </div>
                <div>
                    <h5 style="font-size: 1.1rem; color: ${titleColor}; margin-bottom: 0.2rem;">${item.subject}</h5>
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 0.8rem; background: #ffeaa7; color: #d63031; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${item.focus_level}</span>
                    </div>
                    <p style="font-size: 0.9rem; color: #636e72;">${icon} ${item.tip}</p>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    document.getElementById('roadmap-details').innerHTML = html;
}

// --- API Interactions ---

document.getElementById('log-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const sessionData = {
        subject: document.getElementById('subject').value,
        duration_minutes: parseInt(document.getElementById('duration').value),
        focus_rating: parseInt(document.getElementById('focus').value),
        notes: document.getElementById('notes').value
    };

    try {
        const res = await fetch(`${API_URL}/log_session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionData)
        });

        if (res.ok) {
            alert('Session logged successfully!');
            document.getElementById('log-form').reset();
            document.getElementById('focus-val').innerText = '5';
            showSection('dashboard');
        } else {
            alert('Error logging session.');
        }
    } catch (err) {
        console.error(err);
        alert('Failed to connect to backend.');
    }
});

async function fetchAnalysis() {
    try {
        const res = await fetch(`${API_URL}/analysis`);
        const data = await res.json();

        document.getElementById('ai-suggestion').innerHTML = `
            <strong>Strategy:</strong> ${data.suggestion}<br>
            <br>
            <small>Based on ${data.total_hours} hours of study.</small>
        `;

        // Update Dashboard Stats if on dashboard
        if (document.getElementById('total-time')) {
            document.getElementById('total-time').innerText = `${data.total_hours}h`;
            document.getElementById('avg-focus').innerText = `${data.average_focus}/10`;
            document.getElementById('peak-time').innerText = data.best_time_of_day;
        }

    } catch (err) {
        console.error(err);
        document.getElementById('ai-suggestion').innerText = "Could not fetch AI insights. Is the backend running?";
    }
}

async function loadDashboard() {
    await fetchAnalysis(); // Get stats

    // Fetch sessions for chart
    try {
        const res = await fetch(`${API_URL}/sessions`);
        const sessions = await res.json();
        renderChart(sessions);
    } catch (err) {
        console.error(err);
    }
}

// --- Charts ---
let focusChart = null;

function renderChart(sessions) {
    const ctx = document.getElementById('focusChart').getContext('2d');

    // Process data: get last 7 sessions
    const recentSessions = sessions.slice(-10);
    const labels = recentSessions.map((_, i) => `Session ${i + 1}`);
    const dataPoints = recentSessions.map(s => s.focus_rating);

    if (focusChart) focusChart.destroy();

    focusChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Focus Level',
                data: dataPoints,
                borderColor: '#6c5ce7',
                backgroundColor: 'rgba(108, 92, 231, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Make chart static
            layout: {
                padding: { top: 20, right: 20, bottom: 0, left: 10 }
            },
            scales: {
                y: {
                    min: 0,
                    max: 10,
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: '#636e72',
                        font: { family: "'Outfit', sans-serif" },
                        padding: 10
                    },
                    grid: {
                        color: '#e9ecef',
                        borderDash: [5, 5],
                        drawBorder: false
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#636e72',
                        font: { family: "'Outfit', sans-serif" },
                        padding: 10
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#2d3436',
                    bodyColor: '#2d3436',
                    borderColor: '#dfe6e9',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                }
            }
        }
    });
}

// Init
showSection('dashboard');
