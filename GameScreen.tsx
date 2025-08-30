import React from 'react';
import { SkipForward, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { GameConfig, Word, Participant, GameResults, defaultAchievements } from './types';
import correctSoundFile from './audio/correct.mp3';
import wrongSoundFile from './audio/wrong.mp3';
import timeoutSoundFile from './audio/timeout.mp3';
import letterCorrectSoundFile from './audio/letter-correct.mp3';
import letterWrongSoundFile from './audio/letter-wrong.mp3';
import shopSoundFile from './audio/shop.mp3';
import loseLifeSoundFile from './audio/lose-life.mp3';
import { launchConfetti } from './utils/confetti';
import { speak } from './utils/tts';
import useSound from './utils/useSound';
import useTimer from './utils/useTimer';
import useWordSelection, { difficultyOrder } from './utils/useWordSelection';
import OnScreenKeyboard from './components/OnScreenKeyboard';
import HintPanel from './components/HintPanel';
import AvatarSelector from './components/AvatarSelector';
import { useNotifications, NotificationContainer } from './components/Notification.jsx';

const musicStyles = ['Funk', 'Country', 'Deep Bass', 'Rock', 'Jazz', 'Classical'];

interface GameScreenProps {
  config: GameConfig;
  onEndGame: (results: GameResults) => void;
  musicStyle: string;
  musicVolume: number;
  onMusicStyleChange: (style: string) => void;
  onMusicVolumeChange: (volume: number) => void;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  isMusicPlaying: boolean;
  onToggleMusicPlaying: () => void;
  onQuit: () => void;
}

interface Feedback {
  message: string;
  type: string;
}

// difficultyOrder is imported from useWordSelection

const GameScreen: React.FC<GameScreenProps> = ({
  config,
  onEndGame,
  musicStyle,
  musicVolume,
  onMusicStyleChange,
  onMusicVolumeChange,
  soundEnabled,
  onSoundEnabledChange,
  isMusicPlaying,
  onToggleMusicPlaying,
  onQuit,
}) => {
  const [participants, setParticipants] = React.useState<Participant[]>(
    config.participants.map(p => ({
      ...p,
      attempted: 0,
      correct: 0,
      wordsAttempted: 0,
      wordsCorrect: 0
    }))
  );
  const [currentParticipantIndex, setCurrentParticipantIndex] = React.useState(0);
  const isTeamMode = config.gameMode === 'team';
  const [showWord, setShowWord] = React.useState(true);
  const [usedHint, setUsedHint] = React.useState(false);
  const [letters, setLetters] = React.useState<string[]>([]);
  const [feedback, setFeedback] = React.useState<Feedback>({ message: '', type: '' });
  const [extraAttempt, setExtraAttempt] = React.useState(false);
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const { wordQueues, setWordQueues, currentWord, currentDifficulty, selectNextWord } =
    useWordSelection(config.wordDatabase);
  const [attemptedParticipants, setAttemptedParticipants] = React.useState<Set<number>>(new Set());
  const [missedWords, setMissedWords] = React.useState<Word[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    } catch {
      return [];
    }
  });
  const hiddenInputRef = React.useRef<HTMLInputElement>(null);
  const [startTime] = React.useState(Date.now());
  const [currentAvatar, setCurrentAvatar] = React.useState('');
  const [theme, setTheme] = React.useState(() => localStorage.getItem('theme') || 'light');

  const { notifications, addNotification, removeNotification } = useNotifications();

  const playCorrect = useSound(correctSoundFile, soundEnabled);
  const playWrong = useSound(wrongSoundFile, soundEnabled);
  const playTimeout = useSound(timeoutSoundFile, soundEnabled);
  const playLetterCorrect = useSound(letterCorrectSoundFile, soundEnabled);
  const playLetterWrong = useSound(letterWrongSoundFile, soundEnabled);
  const playShop = useSound(shopSoundFile, soundEnabled);
  const playLoseLife = useSound(loseLifeSoundFile, soundEnabled);

  const {
    timeLeft,
    start: startTimer,
    pause: pauseTimer,
    resume: resumeTimer,
    reset: resetTimer,
    stop: stopTimer,
    isPaused,
  } = useTimer(config.timerDuration, () => {
    playTimeout();
    handleIncorrectAttempt();
  });
  React.useEffect(() => {
    if (localStorage.getItem('teacherMode') === 'true') {
      document.body.classList.add('teacher-mode');
    } else {
      document.body.classList.remove('teacher-mode');
    }
  }, []);

  React.useEffect(() => {
    if (currentWord) {
      setLetters(Array.from({ length: currentWord.word.length }, () => ''));
    }
  }, [currentWord]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentWord || isPaused) return;
      if (/^[a-zA-Z]$/.test(e.key)) {
        typeLetter(e.key);
      } else if (e.key === 'Backspace') {
        handleVirtualBackspace();
      } else if (e.key === 'Enter') {
        handleSpellingSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentWord, isPaused, letters]);

  React.useEffect(() => {
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-honeycomb');
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const selectNextWordForLevel = (level: number) => {
    const nextWord = selectNextWord(level);
    if (nextWord) {
      setAttemptedParticipants(new Set());
      setExtraAttempt(false);
      setIsHelpOpen(false);
      setUsedHint(false);
      setLetters(Array(nextWord.word.length).fill(''));
      if (hiddenInputRef.current) {
        hiddenInputRef.current.focus();
      }
      speak(nextWord.word);
      startTimer();
    } else {
      onEndGameWithMissedWords();
    }
  };

  const nextTurn = () => {
    setCurrentParticipantIndex(prevIndex => (prevIndex + 1) % participants.length);
  };

  function handleIncorrectAttempt() {
    if (extraAttempt) {
      setFeedback({ message: 'Incorrect. You still have one more attempt!', type: 'error' });
      setExtraAttempt(false);
      if (currentWord) setLetters(Array(currentWord.word.length).fill(''));
      startTimer();
      return;
    }

    setFeedback({ message: 'Incorrect. Try again next time!', type: 'error' });
    if (currentWord) setMissedWords(prev => [...prev, currentWord]);

    const updatedParticipants = participants.map((p, index) => {
      if (index === currentParticipantIndex) {
        return {
          ...p,
          lives: p.lives - 1,
          streak: 0,
          difficultyLevel: Math.max(0, p.difficultyLevel - config.progressionSpeed)
        };
      }
      return p;
    });
    setParticipants(updatedParticipants);

    playLoseLife();
    if (currentWord) setLetters(Array(currentWord.word.length).fill(''));

    const newAttempted = new Set(attemptedParticipants);
    newAttempted.add(currentParticipantIndex);

    setTimeout(() => {
      setFeedback({ message: '', type: '' });
      if (newAttempted.size >= participants.length) {
        if (currentWord) {
          setWordQueues(prev => ({ ...prev, review: [...prev.review, currentWord] }));
        }
        setAttemptedParticipants(new Set());
        const nextIndex = (currentParticipantIndex + 1) % participants.length;
        selectNextWordForLevel(updatedParticipants[nextIndex].difficultyLevel);
        nextTurn();
      } else {
        setAttemptedParticipants(newAttempted);
        setUsedHint(false);
        nextTurn();
        startTimer();
      }
    }, 2000);
  }

  const spendPoints = (participantIndex: number, cost: number) => {
    setParticipants(prev =>
      prev.map((p, index) => {
        if (index === participantIndex) {
          return { ...p, points: p.points - cost };
        }
        return p;
      })
    );
    playShop();
  };

  const typeLetter = (letter: string) => {
    if (!currentWord) return;
    setLetters(prev => {
      const index = prev.findIndex(l => l === '');
      if (index === -1) return prev;
      const newLetters = [...prev];
      newLetters[index] = letter;
      const isCorrectLetter = currentWord.word[index].toLowerCase() === letter.toLowerCase();
      const play = isCorrectLetter ? playLetterCorrect : playLetterWrong;
      play();
      return newLetters;
    });
  };

  const handleVirtualLetter = (letter: string) => {
    typeLetter(letter);
  };

  const handleVirtualBackspace = () => {
    setLetters(prev => {
      const reverseIndex = [...prev].reverse().findIndex(l => l !== '');
      if (reverseIndex === -1) return prev;
      const index = prev.length - 1 - reverseIndex;
      const newLetters = [...prev];
      newLetters[index] = '';
      return newLetters;
    });
  };

  const handleSpellingSubmit = () => {
    if (!currentWord) return;
    stopTimer();

    const guess = letters.join('').trim().toLowerCase();
    const isCorrect = guess === currentWord.word.toLowerCase();
    const shouldCountWord = isCorrect || !extraAttempt;

    const updatedParticipants = participants.map((p, index) => {
      if (index === currentParticipantIndex) {
        const multipliers: Record<string, number> = { easy: 1, medium: 2, tricky: 3 };
        const basePoints = 5;
        const multiplier = multipliers[currentDifficulty] || 1;
        const bonus = p.streak * 2;
        const pointsEarned = basePoints * multiplier + bonus;
        return {
          ...p,
          attempted: p.attempted + 1,
          correct: p.correct + (isCorrect ? 1 : 0),
          wordsAttempted: p.wordsAttempted + (shouldCountWord ? 1 : 0),
          wordsCorrect: p.wordsCorrect + (shouldCountWord && isCorrect ? 1 : 0),
          points: isCorrect ? p.points + pointsEarned : p.points,
          streak: isCorrect ? p.streak + 1 : 0,
          difficultyLevel: isCorrect ? (usedHint ? p.difficultyLevel : p.difficultyLevel + config.progressionSpeed) : p.difficultyLevel
        };
      }
      return p;
    });
    setParticipants(updatedParticipants);

    if (isCorrect) {
      const participant = updatedParticipants[currentParticipantIndex];
      const newlyUnlocked = defaultAchievements.filter(
        ach => participant.wordsCorrect >= ach.threshold && !unlockedAchievements.includes(ach.id)
      );

      if (newlyUnlocked.length > 0) {
        const updatedUnlocked = [...unlockedAchievements, ...newlyUnlocked.map(a => a.id)];
        setUnlockedAchievements(updatedUnlocked);
        localStorage.setItem('unlockedAchievements', JSON.stringify(updatedUnlocked));
        newlyUnlocked.forEach(ach => {
          addNotification(`Achievement unlocked: ${ach.icon} ${ach.name}!`);
        });
      }
      
      playCorrect();
      
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (config.effectsEnabled && !prefersReducedMotion) {
        launchConfetti();
      }
      
      setFeedback({ message: 'Correct! 🎉', type: 'success' });
      
      setTimeout(() => {
        const nextIndex = (currentParticipantIndex + 1) % updatedParticipants.length;
        const nextDifficulty = updatedParticipants[nextIndex].difficultyLevel;
        setFeedback({ message: '', type: '' });
        selectNextWordForLevel(nextDifficulty);
        nextTurn();
      }, 2000);
      
      return; // Stop execution for the correct case
    }
    
    // This part only runs if the answer was incorrect
    playWrong();
    handleIncorrectAttempt();
  };

  const skipWord = () => {
    stopTimer();
    const isLivesPenalty = config.skipPenaltyType === 'lives';
    const deduction = isLivesPenalty
      ? `-${config.skipPenaltyValue} life${config.skipPenaltyValue > 1 ? 's' : ''}`
      : `-${config.skipPenaltyValue} pts`;

    const updatedParticipants = participants.map((p, index) => {
      if (index === currentParticipantIndex) {
        const updated = { ...p, streak: 0, wordsAttempted: p.wordsAttempted + 1 };
        return isLivesPenalty
          ? { ...updated, lives: p.lives - config.skipPenaltyValue }
          : { ...updated, points: p.points - config.skipPenaltyValue };
      }
      return p;
    });
    setParticipants(updatedParticipants);

    if (isLivesPenalty) {
      playLoseLife();
    }
    setFeedback({ message: `Word Skipped (${deduction})`, type: 'info' });
    if (currentWord) {
      setWordQueues(prev => ({ ...prev, review: [...prev.review, currentWord] }));
    }
    setAttemptedParticipants(new Set());

    setTimeout(() => {
      const nextIndex = (currentParticipantIndex + 1) % updatedParticipants.length;
      const nextDifficulty = updatedParticipants[nextIndex].difficultyLevel;
      setFeedback({ message: '', type: '' });
      if (currentWord) setLetters(Array(currentWord.word.length).fill(''));
      selectNextWordForLevel(nextDifficulty);
      nextTurn();
    }, 1500);
  };

  const onEndGameWithMissedWords = () => {
    const lessonKey = new Date().toISOString().split('T')[0];
    const stored = JSON.parse(localStorage.getItem('missedWordsCollection') || '{}');
    const existing = stored[lessonKey] || [];
    stored[lessonKey] = [...existing, ...missedWords];
    localStorage.setItem('missedWordsCollection', JSON.stringify(stored));
    const activeParticipants = participants.filter(p => p.lives > 0);
    const finalParticipants = participants.map(p => ({
      ...p,
      accuracy: p.wordsAttempted > 0 ? (p.wordsCorrect / p.wordsAttempted) * 100 : 0
    }));
    onEndGame({
      winner: activeParticipants.length === 1 ? activeParticipants[0] : null,
      participants: finalParticipants,
      gameMode: config.gameMode,
      duration: Math.round((Date.now() - startTime) / 1000),
      missedWords
    });
  };

  React.useEffect(() => {
    if (config.participants.length > 0) {
      selectNextWordForLevel(config.participants[0].difficultyLevel);
    }
  }, []);

  React.useEffect(() => {
    if (!participants || participants.length === 0) return;
    const activeParticipants = participants.filter(p => p.lives > 0);
    if (activeParticipants.length <= 1) {
      onEndGameWithMissedWords();
    }
  }, [participants]);

  const handleMuteToggle = () => {
    audioManager.toggleMute();
  };

  const handleQuit = () => {
    stopTimer();
    if (isMusicPlaying) {
      onToggleMusicPlaying();
    }
    onQuit();
  };

  return (
    <div className="relative screen-container bg-gradient-to-br from-indigo-600 to-purple-800 text-white flex flex-col items-center justify-center">
      <input
        ref={hiddenInputRef}
        type="text"
        className="absolute opacity-0 pointer-events-none"
        aria-hidden="true"
        tabIndex={-1}
      />
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="absolute top-8 left-8 flex gap-8 items-center">
        <button
          onClick={handleQuit}
          className="bg-yellow-300 text-black px-4 py-2 rounded-lg font-bold"
        >
          Back to Menu
        </button>
        <img src="img/bee.svg" alt="Bee icon" className="w-12 h-12" />
        {participants.map((p, index) => (
          <div key={index} className="text-center scorecard">
            <div className="text-2xl font-bold">{p.name}</div>
            <div className="text-4xl font-bold text-yellow-300">{'❤️'.repeat(p.lives)}</div>
            <div className="text-xl font-bold text-green-400">{p.points} pts</div>
          </div>
        ))}
      </div>
      
      {feedback.message && (
        <div className={`absolute top-8 text-2xl font-bold px-6 py-3 rounded-lg ${
          feedback.type === 'success' ? 'bg-green-500' : feedback.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="absolute top-8 right-8 text-center z-50">
          <div className={`timer-display ${timeLeft <= 10 ? 'text-red-500' : 'text-yellow-300'}`}>{timeLeft}</div>
        <div className="text-lg">seconds left</div>
          <button
            onClick={isPaused ? resumeTimer : pauseTimer}
            className="mt-2 bg-yellow-300 text-black btn-responsive rounded-lg font-bold"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
      </div>
      <div className="absolute bottom-8 left-8 bg-black/50 p-4 rounded-lg z-50 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMusicPlaying}
            className="bg-yellow-300 text-black p-2 rounded"
            aria-label={isMusicPlaying ? 'Pause music' : 'Play music'}
          >
            {isMusicPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            onClick={() => onSoundEnabledChange(!soundEnabled)}
            className="bg-yellow-300 text-black p-2 rounded"
            aria-label={soundEnabled ? 'Mute audio' : 'Unmute audio'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={musicVolume}
          onChange={e => onMusicVolumeChange(parseFloat(e.target.value))}
          className="w-32"
        />
        <select
          value={musicStyle}
          onChange={e => onMusicStyleChange(e.target.value)}
          className="text-black rounded p-1"
        >
          {musicStyles.map(style => (
            <option key={style} value={style}>{style}</option>
          ))}
        </select>
      </div>

      <AvatarSelector
        currentAvatar={currentAvatar}
        onSelect={(avatar) => setCurrentAvatar(avatar)}
      />

      <button
        className="theme-toggle"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      {currentWord && (
        <div className="w-full max-w-4xl text-center">
          <img src="img/books.svg" alt="Book icon" className="w-10 h-10 mx-auto mb-4" />
          <h2 className="text-4xl font-bold mb-4">
            Word for {isTeamMode ? 'Team' : 'Student'}: {participants[currentParticipantIndex]?.name || (isTeamMode ? 'Team' : 'Student')}
          </h2>
          <div className="relative mb-8 pt-10">
            {showWord && (
              <div className="inline-block text-7xl font-extrabold text-white drop-shadow-lg bg-black/40 px-6 py-3 rounded-lg">
                {currentWord.word}
                {currentWord.pronunciation && (
                  <span className="ml-4 text-5xl text-yellow-300">{currentWord.pronunciation}</span>
                )}
              </div>
            )}
            <button
              onClick={() => speak(currentWord.word)}
              className="absolute top-0 left-0 bg-yellow-300 text-black btn-responsive rounded-lg font-bold"
            >
              Replay Word
            </button>
            <button
              onClick={() => setShowWord(!showWord)}
              className="absolute top-0 right-0 bg-yellow-300 text-black btn-responsive rounded-lg font-bold"
            >
              {showWord ? 'Hide Word' : 'Show Word'}
            </button>
          </div>
          <HintPanel
            word={currentWord}
            participantPoints={participants[currentParticipantIndex].points}
            participantIndex={currentParticipantIndex}
            spendPoints={spendPoints}
            isTeamMode={isTeamMode}
            showWord={showWord}
            onHintUsed={() => setUsedHint(true)}
            onExtraAttempt={() => setExtraAttempt(true)}
          />
          <div className="flex gap-2 justify-center mb-4">
            {letters.map((letter, idx) => (
              <div
                key={idx}
                className={`w-12 h-16 text-4xl flex items-center justify-center rounded-lg border-b-2 ${
                  letter
                    ? letter.toLowerCase() === currentWord.word[idx].toLowerCase()
                      ? 'bg-green-500'
                      : 'bg-red-500'
                    : 'bg-white/20'
                }`}
              >
                {letter.toUpperCase()}
              </div>
            ))}
          </div>
          <OnScreenKeyboard
            onLetter={handleVirtualLetter}
            onBackspace={handleVirtualBackspace}
            onSubmit={handleSpellingSubmit}
            soundEnabled={soundEnabled}
          />
        </div>
      )}

      <button
        onClick={skipWord}
        className="absolute bottom-8 right-8 bg-orange-500 hover:bg-orange-600 p-4 rounded-lg text-xl"
      >
        <SkipForward size={24} />
      </button>

      {isPaused && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-6xl font-bold z-40">
          Paused
        </div>
      )}
    </div>
  );
};

export default GameScreen;
