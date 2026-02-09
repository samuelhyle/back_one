import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import "./storageShim";
import BackgammonPlatform from "./backgammon.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BackgammonPlatform />
  </React.StrictMode>
);
