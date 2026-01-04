import React from "react"
import { createRoot } from "react-dom/client"
import ApprovalApp from "./ui/ApprovalApp"
import "../popup/ui/styles.css"

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApprovalApp />
  </React.StrictMode>
)
