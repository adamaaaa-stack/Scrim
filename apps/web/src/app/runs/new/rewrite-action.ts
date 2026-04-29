// Re-export from the shared lib so /runs/new keeps working.
// Used to live here; moved to lib/ when the chat input also needed it.
export {
  rewritePromptAction,
  type RewriteResponse,
} from "@/lib/rewrite-prompt";
