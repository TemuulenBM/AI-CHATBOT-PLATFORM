/**
 * Lightweight Markdown parser for chat messages
 * Supports: bold, italic, links, code, code blocks, lists
 */

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Parse inline markdown elements
function parseInline(text: string): string {
  let result = escapeHtml(text);

  // Code (backticks) - must be done before other formatting
  result = result.replace(/`([^`]+)`/g, '<code class="convoai-inline-code">$1</code>');

  // Bold (**text** or __text__)
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italic (*text* or _text_)
  result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  result = result.replace(/_([^_]+)_/g, "<em>$1</em>");

  // Links [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="convoai-link">$1</a>'
  );

  // Auto-link URLs
  result = result.replace(
    /(?<!["\(])(https?:\/\/[^\s<]+)(?!["\)])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="convoai-link">$1</a>'
  );

  return result;
}

// Parse code blocks
function parseCodeBlocks(text: string): string {
  // Code blocks with language
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  return text.replace(codeBlockRegex, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trim());
    const langClass = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
    return `<pre class="convoai-code-block"${langClass}><code>${escapedCode}</code></pre>`;
  });
}

// Parse lists
function parseLists(text: string): string {
  const lines = text.split("\n");
  let result: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" | null = null;

  for (const line of lines) {
    const unorderedMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);

    if (unorderedMatch) {
      if (!inList || listType !== "ul") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ul class="convoai-list">');
        inList = true;
        listType = "ul";
      }
      result.push(`<li>${parseInline(unorderedMatch[1])}</li>`);
    } else if (orderedMatch) {
      if (!inList || listType !== "ol") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ol class="convoai-list">');
        inList = true;
        listType = "ol";
      }
      result.push(`<li>${parseInline(orderedMatch[1])}</li>`);
    } else {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
        listType = null;
      }
      result.push(line);
    }
  }

  if (inList) {
    result.push(`</${listType}>`);
  }

  return result.join("\n");
}

// Main markdown parser
export function parseMarkdown(text: string): string {
  if (!text) return "";

  let result = text;

  // Parse code blocks first (to prevent other parsing inside them)
  result = parseCodeBlocks(result);

  // Split by code blocks to avoid parsing inside them
  const parts = result.split(/(<pre class="convoai-code-block"[\s\S]*?<\/pre>)/);

  result = parts
    .map((part) => {
      // Don't process code blocks
      if (part.startsWith('<pre class="convoai-code-block"')) {
        return part;
      }

      // Parse lists
      let processed = parseLists(part);

      // Parse remaining inline elements (for non-list lines)
      const lines = processed.split("\n");
      processed = lines
        .map((line) => {
          // Don't process lines that are already HTML tags
          if (line.startsWith("<ul") || line.startsWith("<ol") || line.startsWith("<li") || line.startsWith("</")) {
            return line;
          }
          return parseInline(line);
        })
        .join("<br>");

      return processed;
    })
    .join("");

  // Clean up excessive line breaks
  result = result.replace(/<br><br>+/g, "<br><br>");
  result = result.replace(/^<br>|<br>$/g, "");

  return result;
}

// Get styles for markdown elements
export function getMarkdownStyles(primaryColor: string): string {
  return `
    .convoai-inline-code {
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 0.9em;
    }

    .convoai-code-block {
      background: rgba(0, 0, 0, 0.3);
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 8px 0;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 0.85em;
      line-height: 1.5;
    }

    .convoai-code-block code {
      background: none;
      padding: 0;
    }

    .convoai-link {
      color: ${primaryColor};
      text-decoration: underline;
    }

    .convoai-link:hover {
      opacity: 0.8;
    }

    .convoai-list {
      margin: 8px 0;
      padding-left: 20px;
    }

    .convoai-list li {
      margin: 4px 0;
    }

    .convoai-message.assistant strong {
      font-weight: 600;
    }

    .convoai-message.assistant em {
      font-style: italic;
    }
  `;
}
