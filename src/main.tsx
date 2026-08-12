import React from 'react'
import { createRoot } from 'react-dom/client'
import App from "./App.tsx";
import "./index.css"; // Biarkan ini tetap ada karena file index.css tidak kita pindah

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
