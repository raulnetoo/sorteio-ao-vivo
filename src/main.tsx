import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  // 💡 Se ainda notar algo com foco durante o desenvolvimento, teste sem StrictMode:
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);
