import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Layout from "@/components/rmc/Layout";
import InstallPrompt from "@/components/rmc/InstallPrompt";
import Home from "@/pages/Home";
import Library from "@/pages/Library";
import Leaderboard from "@/pages/Leaderboard";
import Profile from "@/pages/Profile";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import MemoryMatch from "@/pages/games/MemoryMatch";
import SnakesLadders from "@/pages/games/SnakesLadders";
import ConnectFour from "@/pages/games/ConnectFour";
import Checkers from "@/pages/games/Checkers";
import RockPaperScissors from "@/pages/games/RockPaperScissors";
import CrazyEights from "@/pages/games/CrazyEights";
import Chess from "@/pages/games/Chess";
import Uno from "@/pages/games/Uno";
import Ludo from "@/pages/games/Ludo";
import Scrabble from "@/pages/games/Scrabble";
import Dominoes from "@/pages/games/Dominoes";
import GoFish from "@/pages/games/GoFish";
import OldMaid from "@/pages/games/OldMaid";
import Jenga from "@/pages/games/Jenga";
import Battles from "@/pages/Battles";
import BattlePlay from "@/pages/BattlePlay";
import Friends from "@/pages/Friends";
import { Privacy, Terms, Support } from "@/pages/Legal";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="font-pixel text-neon-cyan">LOADING…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/library" element={<Library />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route path="/play/memory" element={<MemoryMatch />} />
                <Route path="/play/snakes" element={<SnakesLadders />} />
                <Route path="/play/connect4" element={<ConnectFour />} />
                <Route path="/play/checkers" element={<Checkers />} />
                <Route path="/play/rps" element={<RockPaperScissors />} />
                <Route path="/play/crazy8" element={<CrazyEights />} />
                <Route path="/play/chess" element={<Chess />} />
                <Route path="/play/uno" element={<Uno />} />
                <Route path="/play/ludo" element={<Ludo />} />
                <Route path="/play/scrabble" element={<Scrabble />} />
                <Route path="/play/dominoes" element={<Dominoes />} />
                <Route path="/play/gofish" element={<GoFish />} />
                <Route path="/play/oldmaid" element={<OldMaid />} />
                <Route path="/play/jenga" element={<Jenga />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/support" element={<Support />} />
                <Route
                  path="/battles"
                  element={
                    <ProtectedRoute>
                      <Battles />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/friends"
                  element={
                    <ProtectedRoute>
                      <Friends />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/battle/:roomId"
                  element={
                    <ProtectedRoute>
                      <BattlePlay />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
            <InstallPrompt />
            <Toaster theme="dark" richColors position="top-center" />
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
