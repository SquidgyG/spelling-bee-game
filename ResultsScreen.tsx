import React, { useEffect, useRef, useState } from 'react';
import { GameResults, GameConfig, LeaderboardEntry } from './types';
import applauseSoundFile from './audio/applause.mp3';
import { launchConfetti } from './utils/confetti';
import { recordDailyCompletion, StreakInfo } from './DailyChallenge';
import beeImg from './img/avatars/bee.svg';

interface ResultsScreenProps {
  results: GameResults;
  config: GameConfig;
  onRestart: () => void;
  onViewLeaderboard: () => void;
}

const ResultsScreen: React.FC<ResultsScreenProps> = ({ results, config, onRestart, onViewLeaderboard }) => {
  const applauseAudio = useRef<HTMLAudioElement>(new Audio(applauseSoundFile));
  const totalScore = results.participants.reduce((sum, p) => sum + p.points, 0);
  const [bestClassScore, setBestClassScore] = useState(0);
  const [isBestScore, setIsBestScore] = useState(false);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [bonus, setBonus] = useState(0);

  useEffect(() => {
    if (config.dailyChallenge) {
      const info = recordDailyCompletion();
      setStreakInfo(info);
      setBonus(info.currentStreak > 1 ? (info.currentStreak - 1) * 10 : 0);
    }
  }, [config.dailyChallenge]);
  
  useEffect(() => {
    if (localStorage.getItem('teacherMode') === 'true') {
      document.body.classList.add('teacher-mode');
    } else {
      document.body.classList.remove('teacher-mode');
    }
  }, []);

  useEffect(() => {
    // Update the leaderboard with the new scores
    const stored: LeaderboardEntry[] = JSON.parse(localStorage.getItem('leaderboard') || '[]');
    const newEntries: LeaderboardEntry[] = results.participants.map(p => ({
      name: p.name,
      score: p.points + (config.dailyChallenge ? bonus : 0),
      date: new Date().toISOString(),
      avatar: p.avatar,
    }));
    const updated = [...stored, ...newEntries]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    localStorage.setItem('leaderboard', JSON.stringify(updated));
  }, [results, config.dailyChallenge, bonus]);

  useEffect(() => {
    const history: { date: string; score: number }[] = JSON.parse(localStorage.getItem('sessionHistory') || '[]');
    history.push({ date: new Date().toISOString(), score: totalScore });
    localStorage.setItem('sessionHistory', JSON.stringify(history));

    const storedBest = Number(localStorage.getItem('bestClassScore') || '0');
    if (totalScore > storedBest) {
      localStorage.setItem('bestClassScore', String(totalScore));
      setBestClassScore(totalScore);
      setIsBestScore(true);
    } else {
      setBestClassScore(storedBest);
    }
  }, [totalScore]);

  useEffect(() => {
    // Play sound and show confetti if there's a winner and effects are enabled
    if (results.winner) {
      if (config.soundEnabled) {
        applauseAudio.current.play();
      }
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (config.effectsEnabled && !prefersReducedMotion) {
        launchConfetti();
      }
    }
  }, [results.winner, config.soundEnabled, config.effectsEnabled]);

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(results, null, 2));
    const anchor = document.createElement('a');
    anchor.href = dataStr;
    anchor.download = 'spelling-bee-results.json';
    anchor.click();
  };

  const getWinnerMessage = () => {
    const { winner, participants } = results;
    if (winner) {
      return `Winner: ${winner.name}`;
    }
    const activeParticipants = participants.filter(p => p.lives > 0);
    if (activeParticipants.length > 1) {
      const names = activeParticipants.map(p => p.name).join(' and ');
      return `It's a draw between ${names}!`;
    }
    return 'No one wins this round!';
  };

  return (
    <div className="screen-container bg-gradient-to-br from-gray-700 to-gray-900 text-white text-center flex flex-col items-center justify-center">
      <h1 className="screen-title text-yellow-300 mb-4">🏆 Game Over! 🏆</h1>
      <h2 className="screen-subtitle mb-8">{getWinnerMessage()}</h2>

      {results?.duration && (<div className="text-2xl mb-6">Game Duration: {results.duration} seconds</div>)}
      
      <div className="text-xl mb-4">Session Score: {totalScore}</div>
      <div className="text-xl mb-8">
        Best Class Score: {bestClassScore}
        {isBestScore && <span className="text-green-400 font-bold ml-2">New High Score!</span>}
      </div>

      <div className="bg-white/10 p-8 rounded-lg w-full max-w-md scorecard">
        <h3 className="text-3xl font-bold mb-4">📊 Final Scores</h3>
        {results && results.participants.map((p, index) => (
          <div key={index} className="text-left text-xl mb-3">
            <div className="flex items-center gap-2">
              <img src={p.avatar || beeImg} alt={`${p.name} avatar`} className="w-6 h-6 rounded-full" />
              <div className="font-bold">{p.name}</div>
            </div>
            <div className="text-yellow-300">
              {p.wordsCorrect}/{p.wordsAttempted} correct ({p.wordsAttempted > 0 ? Math.round((p.wordsCorrect / p.wordsAttempted) * 100) : 0}
              %) - {p.lives} lives remaining - {p.points + (config.dailyChallenge ? bonus : 0)} points
            </div>
          </div>
        ))}
      </div>

      {config.dailyChallenge && streakInfo && (
        <div className="bg-white/10 p-4 rounded-lg w-full max-w-md mt-4">
          <div className="text-xl">
            🔥 Streak: {streakInfo.currentStreak} day{streakInfo.currentStreak !== 1 ? 's' : ''} (Best {streakInfo.highestStreak})
          </div>
          {bonus > 0 && (<div className="text-yellow-300">Bonus Points: +{bonus}</div>)}
        </div>
      )}

      {results.missedWords && results.missedWords.length > 0 && (
        <div className="bg-white/10 p-8 rounded-lg w-full max-w-md mt-8 scorecard">
          <h3 className="text-3xl font-bold mb-4">❌ Missed Words</h3>
          {results.missedWords.map((w, index) => (
            <div key={index} className="text-left text-xl mb-2">
              <span className="font-bold">{w.word}</span> - {w.definition}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-6 mt-12 flex-wrap justify-center">
        <button onClick={handleExport} className="bg-green-500 hover:bg-green-600 btn-responsive rounded-xl font-bold text-xl md:text-2xl">
            📤 Export Results
        </button>
        <button onClick={onViewLeaderboard} className="bg-purple-500 hover:bg-purple-600 btn-responsive rounded-xl font-bold text-xl md:text-2xl">
            📈 View Leaderboard
        </button>
        <button onClick={onRestart} className="bg-blue-500 hover:bg-blue-600 btn-responsive rounded-xl font-bold text-xl md:text-2xl">
            🔄 Play Again
        </button>
      </div>
    </div>
  );
};

export default ResultsScreen;