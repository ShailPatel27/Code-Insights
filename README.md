# Code Insights

**Code Insights** is a lightweight VS Code extension that helps you understand what common library functions *actually do*, directly inside the editor.

Instead of switching to documentation, it provides **inline explanations, behavioral notes, and structured insights** through hover tooltips and a sidebar.

This extension focuses on **learning and correctness**, not execution.

---

## In Action

### Hover Insights

Quick, contextual explanations appear directly when hovering over a supported function.

![Hover Insights](images/readme_image_1.png)

### Learn More Sidebar

Deeper, structured information is available in a persistent side panel.

![Learn More Sidebar](/images/readme_image_2.png)

---

## What Problem Does This Solve?

Many bugs (especially for learners) come from misunderstandings such as:

* Does this function modify data in place?
* Does it return a new object or `None`?
* Why do two similarly named APIs behave differently?
* What are the practical side effects of calling this function?

Official documentation often explains *what* a function does, but not always **how it behaves in practice**.

**Code Insights makes these behaviors visible at the point of use.**

---

## Features (v0.3.0)

### Smarter Hover Detection

Hover insights are now shown **only for real function calls**, not for:

* strings
* comments
* variable names

The extension resolves functions based on **import context**, not simple word matching.

### NumPy Import Awareness

Supports common NumPy usage patterns, including:

* `np.random.shuffle(arr)`
* custom aliases (e.g. `import numpy as nump`)
* `from numpy.random import shuffle`

This results in **more accurate and predictable hovers**.

### Method Call Detection (New in v0.3.0)

Code Insights now understands **method calls on NumPy arrays**, such as:

* `arr.sort()`

The extension infers the receiver type using simple assignment patterns (e.g. `arr = np.arange(...)`) and shows the correct behavioral insights when the type can be determined confidently.

Ambiguous cases are intentionally ignored to avoid misleading information.

### Learn More Sidebar

Click **Learn More** to open a side panel with:

* Function signature
* Clear description
* Main parameters (attributes)
* Usage examples
* Behavioral notes

### Test & Ask AI (Planned)

The UI includes **Test** and **Ask AI** sections to show the future direction of the tool.

In **v0.3.0**:

* These sections display **“Coming soon”**
* No code execution or AI calls are performed

This is intentional and documented.

---

## Installation

Install directly from the VS Code Marketplace by searching for **Code Insights**.

---

## Currently Supported Functions

This version focuses on a small, carefully curated set of NumPy APIs:

* `np.random.shuffle`
* `np.random.permutation`
* `np.sort`
* `ndarray.sort`
* `np.reshape`
* `np.copy`

Each function includes:

* Parameter-level explanations
* Mutation vs non-mutation behavior
* Return semantics
* Simple usage examples

The data is defined using a structured JSON schema, making it easy to extend.

---

## How It Works

* The extension uses **static, curated metadata** (JSON)
* It does **not** analyze or execute your code
* Function detection is **resolver-based**, using import context
* The sidebar is a single persistent panel with internal navigation

This keeps the extension:

* fast
* predictable
* safe to use in any project

---

## Limitations

This is still an **early-stage project**. By design:

* No code execution
* No runtime inspection
* No AI responses yet
* No full semantic analysis
* Limited function coverage

The extension aims to **explain behavior**, not replace documentation or debugging tools.

---

## Planned Improvements

Future versions may include:

* Expanded method support beyond NumPy ndarrays
* Support for additional libraries (pandas, built-ins, etc.)
* Attribute-level interactive testing
* AI-assisted explanations

These features are intentionally **not part of v0.3.0**.

---

## Project & Branding

**Code Insights** is developed under **Lenex**
🌐 [https://lenex.dev](https://lenex.dev)

---

## Project Links

* **Source Code:** [https://github.com/ShailPatel27/Code-Insights](https://github.com/ShailPatel27/Code-Insights)
* **Issues / Feedback:** [https://github.com/ShailPatel27/Code-Insights/issues](https://github.com/ShailPatel27/Code-Insights/issues)

---

## Status

**Version:** v0.3.0
**Stage:** Early development (resolver-driven, learning + correctness focused)

This release introduces smarter function detection and establishes a solid foundation for future expansion.

---

## License

MIT License