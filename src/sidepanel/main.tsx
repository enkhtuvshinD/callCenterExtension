import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { SipProvider } from "./SipProvider";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SipProvider>
      <App />
    </SipProvider>
  </React.StrictMode>
);
