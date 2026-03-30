// File purpose: Frontend entry point that boots the React app and Cesium runtime.
import React from "react";
import ReactDOM from "react-dom/client";
import { Ion } from "cesium";
import App from "./App";
import "./styles.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

(window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/Cesium";
Ion.defaultAccessToken = "";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
