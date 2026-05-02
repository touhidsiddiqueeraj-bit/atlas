# Atlas — AI Chat

Live at https://touhidsiddiqueeraj-bit.github.io/atlas/

---

## ⚠️ Disclaimer

This software is provided **"AS IS"** without any warranties, express or implied. The authors accept no responsibility for any damage, data loss, or issues arising from its use.

### Known Issues

- **Document Editor**: Some formatting changes may not save correctly
- **Web Search**: May break on certain models
- **Long Responses**: May occasionally get truncated (Auto-Continue helps mitigate this)

---

## 🔐 Security & Privacy

- **API keys are stored ONLY on your device** — never transmitted to any server except directly to AI providers
- Keys exist only in browser memory and optional IndexedDB storage
- You control storage options: session-only or persistent
- Easy data deletion available in Settings
- Export/Import for complete data portability

---

## ✨ Features

### 🎯 Flagship
- **Smart Patch** — Edit generated code surgically, only send changed snippets instead of rewriting entire files
- **Skills System** — 7 built-in skills with Smart auto-detect
- **Auto-Continue** — Automatically continues when responses get truncated

### 💬 Chat Interface
- Multi-provider support: **OpenRouter**, **DeepSeek**, **Gemini**, **OpenAI**
- Streaming responses in real-time
- Full **Markdown** rendering
- **Code syntax highlighting** with line numbers

### 📝 Visual Document Editors
- **Word/DOCX Editor** — Full visual document editor with formatting toolbar
- **PowerPoint/PPTX Editor** — Slide-by-slide presentation editor with layouts
- **Code IDE** — Full IDE with syntax highlighting for code editing

### 🔌 Integrations
- **Tool Calls** — Function calling support for AI models
- **Google Drive** — Backup and restore your data
- **Web Search** — Search the web through OpenRouter plugin
- **Image Generation** — DALL-E, Stable Diffusion, Flux support

### 📄 File Export
- DOCX (Microsoft Word)
- PPTX (Microsoft PowerPoint)
- PDF

### 💾 Data Management
- **IndexedDB** local storage
- Import/Export conversations as JSON
- Session persistence

### 🧰 Additional Features
- Dark/Light themes
- Cost tracking with budget caps
- 100+ AI model selection with filters
- File attachments
- System prompts
- DeepSeek-style message navigation panel
- Context tracking bar
- Toast notifications

---

## 🚀 Quick Start

### Option 1: Open Directly
```
# Just open the HTML file in your browser
open Atlas-34.html
# or
firefox Atlas-34.html
```

### Option 2: Local Server (Recommended for full functionality)
```bash
# Navigate to the folder
cd /path/to/Atlas

# Start a local server
python3 -m http.server 8080

# Open in browser
http://localhost:8080/Atlas-34.html
```

### Option 3: Host Anywhere
Upload to any static hosting:
- Netlify
- Vercel
- GitHub Pages
- Any web host

---

## 🔑 API Keys Required

Get free API keys from your preferred provider:

| Provider | Location | Free Tier |
|----------|----------|----------|
| OpenRouter | [openrouter.ai](https://openrouter.ai) | ✅ Yes (limited) |
| DeepSeek | [deepseek.com](https://deepseek.com) | ✅ Yes |
| Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | ✅ Yes |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | ❌ No |

---

## 🧠 Skills Reference

| Skill | Icon | Use Case |
|-------|------|---------|
| 🎨 Frontend | UI/website design with modern aesthetics |
| 💻 Code | Programming help, debugging, algorithms |
| 📄 Document | Reports, essays, memos, professional writing |
| 📊 Data | Data analysis, charts, statistics |
| 🎮 Game | Game development, mechanics, physics |
| 🎭 Creative | Fiction, storytelling, creative writing |
| 🧠 Analysis | Deep reasoning, research, evaluation |

### Smart Auto-Detect
When enabled, Atlas automatically detects what you're trying to do and suggests the appropriate skill:
- Type "build me a website" → 🎨 Frontend detected
- Type "write a report" → 📄 Document detected
- Type "fix this bug" → 💻 Code detected
- Type "create a game" → 🎮 Game detected

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift + Enter` | New line in input |
| `Escape` | Stop response generation |

---

## 📁 Project Structure

```
Atlas/
├── Atlas-34.html          # Main application (single file - everything included!)
├── README.md             # This documentation
├── screenshots/         # (optional)
│   └── *.png
```

---

## 🔧 Troubleshooting

**Q: Skills modal won't open**
A: Make sure Smart Auto-Detect is enabled in Settings

**Q: API key not working**
A: Some keys are provider-specific. Check you've selected the correct provider.

**Q: Cost tracking shows $0**
A: Enable cost tracking in Settings. For Gemini, check your tier status.

**Q: Web search not working**
A: Web search may break on certain models - this is a known issue.

---

## 📋 Version History

- **v1.0** - Initial release with core features
- Skills system with Smart auto-detect
- Visual document editors
- Full IDE support

---

## 📄 License

<a rel="license" href="http://creativecommons.org/licenses/by-nc-sa/4.0/">
<img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by-nc-sa/4.0/88x31.png" />
</a>

This work is licensed under a **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License**.

You are free to:
- **Share** — Copy and redistribute the material
- **Adapt** — Remix, transform, and build upon the material

Under these terms:
- **Attribution** — Must give appropriate credit
- **NonCommercial** — Cannot use for commercial purposes
- **ShareAlike** — Must distribute under the same license

---

## 👤 Author

**Hussain Touhid Siddiquee**

---

## 🤝 Contributing

Found a bug? Have a feature request?
- Open an issue on GitHub
- Submit a pull request
- Fork and improve!

---

*Atlas — A unified AI chat interface for everyone.*
