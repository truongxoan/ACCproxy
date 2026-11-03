---
name: reverse-engineer-anything
description: Expert reverse engineering, clean-room reimplementation, static recompilation, and protocol/hardware reverse engineering guide based on awesome-reverse-engineer-anything.
version: 1.0.0
author: maluramichael & community
tags:
  - reverse-engineering
  - clean-room
  - decompilation
  - static-recompilation
  - mcp
  - binary-analysis
  - protocol-reverse-engineering
---

# Reverse Engineer Anything (REA) Skill

A comprehensive operational playbook and knowledge base for AI agents to disassemble, analyze, intercept, decompile, and rebuild closed systems (applications, games, protocols, file formats, and hardware/firmware) into clean-room, native, or interoperable open-source implementations.

---

## 1. System Roles & Core Directives

When this skill is loaded, the agent operates as a **Senior Reverse Engineering & Systems Architect**:
- **Clean-Room Integrity:** Maintain strict separation between specification extraction (black-box / disassembled analysis) and implementation to avoid copyright violations.
- **Asset Legality:** Adhere strictly to the "Bring Your Own Asset / Dump" standard. Never bundle proprietary binaries, ROMs, ISOs, or closed game assets.
- **Deterministic Verification:** Integrate automated static analysis, dynamic instrumentation, and differential test harnesses (e.g., fuzzing against original outputs) to verify correctness.
- **Tool Automation:** Prioritize automated workflows using MCP (Model Context Protocol) servers for tools like Ghidra, IDA Pro, Frida, and browser/network proxies.

---

## 2. Reverse Engineering Taxonomy

### Category Overview & Target Archetypes

| Domain | Focus Areas | Reference Archetypes |
| :--- | :--- | :--- |
| **Desktop Apps & OS Rebuilds** | Clean-room clones in modern languages (e.g., Rust), compatibility layers, sub-system rewrites. | PhotoCraft (Photoshop), WordCraft (Word), ReactOS (Windows NT), Darling (macOS/Darwin), Wine (Win32). |
| **Games & Engines** | Decompilation, static recompilation (ahead-of-time binary rewriting), source ports, engine reimplementation. | Zelda64Recomp / totk-pc-recomp, OpenRCT2 (RollerCoaster Tycoon 2), OpenRA, OpenMW (Morrowind), nxnative. |
| **Emulators** | Software execution of guest architectures, JIT re-compilers, HLE/LLE system calls. | shadPS4, RPCS3, PCSX2, Dolphin, xemu, Xenia. |
| **Protocols & Formats** | Undocumented binary/packet protocols, private REST/WebSocket APIs, encrypted sync endpoints. | OpenHaystack (Find My), Baileys / whatsmeow (WhatsApp), libimobiledevice (iOS), YouTube.js (InnerTube). |
| **Hardware & Firmware** | Debloating smart TVs, custom firmware for locked IoT/clean-room replacements, RF/BLE capture. | Clean Your TV / Free My TV, Valetudo (Vacuum robots), rtl_433 (ISM bands), m1n1 (Apple Silicon). |

---

## 3. Toolkit & Agent MCP Ecosystem

### AI Agent Integrations & MCP Tools
- **REA (Reverse Engineer Anything MCP):** End-to-end orchestration bridge for agents to inspect binaries down to machine code.
- **GhidraMCP / ida-pro-mcp:** Bridges Ghidra / IDA Pro decompiler APIs with LLMs to decompile functions, rename symbols, and map structs automatically.
- **Open ReverseLab:** Unified agent platform wrapping Ghidra, Frida, x64dbg, and Rizin.
- **reverify:** Validation tool to verify LLM code deductions against deterministic binary ground truth.
- **reverse-api-engineer / Unbrowse:** Automatically sniffs network endpoints and generates strongly-typed client code (TypeScript/Python).

### Decompilers & Disassemblers
- **Native / Binaries:** Ghidra, IDA Pro, radare2, Rizin, Kuna (Rust-based agent decompiler).
- **Managed & Bytecode:**
  - **Android (DEX/APK):** JADX, Apktool, ASC (Agent-optimized Android decompiler).
  - **.NET / CIL:** ILSpy, dnSpyEx.
  - **Java:** CFR, Fernflower.

### Dynamic Instrumentation & Debugging
- **Dynamic Probing:** Frida (Hooking memory, tracing methods, runtime inspection).
- **Debuggers:** x64dbg (Windows user-mode), GDB / LLDB.
- **Capability Analysis:** `capa` (Automated extraction of high-level capabilities in binaries).

### Network & Binary Inspection
- **Network Interception:** `mitmproxy`, `mitmproxy2swagger` (Generates OpenAPI specs from raw traffic).
- **Firmware & Hex:** ImHex, REHex, `binwalk` (Extracting file systems from compressed ROMs).

---

## 4. Execution Playbooks

### Playbook A: Clean-Room Reimplementation of a Closed App
1. **Black-Box Profiling:**
   - Run the target binary in a sandboxed trace environment.
   - Use `capa` and dynamic hooks (Frida/eBPF) to identify core features, system calls, and exported interfaces.
2. **Format & Spec Extraction:**
   - Map proprietary file structures with ImHex pattern definitions.
   - Extract schema definitions, data structures, and edge-case behavior into formal specifications (Markdown / Protocol Buffers).
3. **Clean-Room Code Synthesis:**
   - Implement the engine from scratch in a memory-safe language (e.g., Rust, Go, Modern C++).
   - Use differential testing: feed identical inputs to both original and clean-room binaries to assert bit-level or behavior-level parity.

### Playbook B: Static Recompilation of Legacy Game Binaries
1. **Decompilation / Relocation Extraction:**
   - Parse executable sections (ELF/PE/DOL/XBE).
   - Use automated tools (e.g., N64Recomp / custom recompiler passes) to translate guest machine code directly into LLVM IR or target C/C++ code.
2. **Runtime Translation Layer:**
   - Map guest system calls, GPU graphics pipes, and audio drivers to modern cross-platform backends (Vulkan / Metal / SDL3 / WebAudio).
3. **Bring-Your-Own-Data Assembly:**
   - Package the recompiled codebase with an extraction script that unpacks the original, user-supplied game binary at launch.

### Playbook C: Private API & Protocol Reverse Engineering
1. **Traffic Interception:**
   - Route device/app network traffic through `mitmproxy`.
   - If certificate pinning is enforced, deploy Frida scripts to bypass SSL pinning (`SSL_CTX_set_custom_verify`, Network Security Config).
2. **Contract Generation:**
   - Export sanitized HAR/flow data to `mitmproxy2swagger`.
   - Map payload encryption/signature keys by disassembling client signing functions (`HMAC`, token seeds, auth handshakes).
3. **Client Library Implementation:**
   - Write strongly-typed, idiomatic client libraries with automated keep-alive, handshake handling, and schema validation.

### Playbook D: Smart TV & IoT Cloud Unshackling
1. **Attack Surface Discovery:**
   - Probe open ADB, Telnet, or UART ports on local IoT/Smart TV devices.
2. **Debloating & Local Control:**
   - Disable telemetry, vendor launchers, and addaemons via ADB shell or localized DNS rerouting.
   - For vacuum robots and smart home devices, install local firmware replacements (like Valetudo) to redirect MQTT/WebSocket traffic to local Home Assistant instances.

---

## 5. Output Guidelines & Best Practices for Agents

- **Modularity:** Keep extracted schemas and protocol definitions separate from consumer code.
- **Reproducibility:** Always document exact offsets, toolchain flags, and decompiler commands so another human or agent can audit the results.
- **Safety & Scope:** Focus exclusively on interoperability, device ownership, performance preservation, and security research.
