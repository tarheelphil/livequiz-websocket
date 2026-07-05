const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// In-memory state (fine for 500 users)
let currentQuestion = null;
let leaderboard = [
    { id: 1, name: "Alex Chen", score: 850, avatar: "🚀" },
    { id: 2, name: "Sam Rivera", score: 720, avatar: "🌟" },
    { id: 3, name: "Jordan Kim", score: 680, avatar: "🔥" },
    { id: 4, name: "Taylor Brooks", score: 590, avatar: "🧠" }
];
let totalResponses = 0;
let quizActive = false;

// All 50 questions
const allQuestions = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    q: i % 7 === 0 ? `What is the capital of the ${i + 1}th country in this quiz?` : `Question ${i + 1}: Select the correct answer`,
    options: ["Option A", "Option B", "Option C", "Option D"],
    ans: Math.floor(Math.random() * 4)
}));

let usedQuestions = [];

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.emit('quiz-state', {
        currentQuestion,
        leaderboard: [...leaderboard].sort((a, b) => b.score - a.score),
        totalResponses,
        quizActive
    });

    socket.on('join-as-presenter', () => {
        socket.join('presenters');
        socket.emit('presenter-mode');
    });

    socket.on('join-as-audience', (name = `User_${socket.id.slice(0,6)}`) => {
        socket.name = name;
        socket.join('audience');
        socket.emit('audience-mode');
    });

    socket.on('start-quiz', () => {
        quizActive = true;
        usedQuestions = [];
        totalResponses = 0;
        leaderboard.forEach(p => p.score = Math.floor(Math.random() * 400) + 200);
        io.emit('quiz-started');
        nextQuestion();
    });

    socket.on('next-question', () => {
        nextQuestion();
    });

    socket.on('reveal-answer', () => {
        if (currentQuestion) {
            io.emit('answer-revealed', currentQuestion.ans);
        }
    });

    socket.on('end-quiz', () => {
        quizActive = false;
        io.emit('quiz-ended', { finalLeaderboard: [...leaderboard].sort((a,b)=>b.score-a.score) });
    });

    socket.on('submit-answer', ({ selectedIndex }) => {
        if (!currentQuestion || !quizActive) return;

        totalResponses++;
        
        const points = (selectedIndex === currentQuestion.ans) ? 100 : 25;
        
        let player = leaderboard.find(p => p.name === socket.name);
        if (!player) {
            player = { 
                id: leaderboard.length + 1, 
                name: socket.name, 
                score: 0, 
                avatar: ["🚀","🌟","🔥","🧠","💡"][Math.floor(Math.random()*5)] 
            };
            leaderboard.push(player);
        }
        player.score += points;

        io.emit('response-count', totalResponses);
        io.emit('leaderboard-update', [...leaderboard].sort((a, b) => b.score - a.score));
    });
});

function nextQuestion() {
    let available = allQuestions.filter(q => !usedQuestions.includes(q.id));
    if (available.length === 0) {
        usedQuestions = [];
        available = [...allQuestions];
    }
    
    currentQuestion = { ...available[Math.floor(Math.random() * available.length)] };
    usedQuestions.push(currentQuestion.id);
    
    totalResponses = 0;
    
    io.emit('new-question', currentQuestion);
    io.emit('response-count', 0);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 LiveQuiz Server running on http://localhost:${PORT}`);
});