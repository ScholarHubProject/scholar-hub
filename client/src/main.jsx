import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { applySettingsTheme, watchSystemTheme } from "./settings";
import "./index.css";

applySettingsTheme();
watchSystemTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
