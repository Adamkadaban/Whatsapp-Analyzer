import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ErrorBoundary from "./components/ErrorBoundary";
import { preloadWorker } from "./lib/wasm";

export default function App() {
  // Preload WASM worker during idle time so first analysis is faster
  useEffect(() => {
    preloadWorker();
  }, []);

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <Navbar />
        <div className="page">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
