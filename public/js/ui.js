import { escapeHtml, icon } from "./utils.js";

const toastRegion = () => document.getElementById("toast-region");
const modalRoot = () => document.getElementById("modal-root");

let activeDialog = null;

export function toast(message, { type = "success", actionLabel = "", onAction = null, duration = 5000 } = {}) {
  const region = toastRegion();
  if (!region) return;
  const node = document.createElement("div");
  node.className = `toast toast-${type}`;
  node.setAttribute("role", "status");

  const iconName = type === "error" ? "alert-circle" : type === "info" ? "info" : "check-circle";
  node.innerHTML = `<span class="toast-icon">${icon(iconName, 20)}</span><span class="toast-message"></span>`;
  node.querySelector(".toast-message").textContent = message;

  if (actionLabel && onAction) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "toast-action";
    action.textContent = actionLabel;
    action.addEventListener("click", () => {
      onAction();
      node.remove();
    });
    node.append(action);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Dismiss notification");
  close.innerHTML = icon("x", 16);
  close.addEventListener("click", () => node.remove());
  node.append(close);

  region.append(node);
  while (region.children.length > 3) {
    region.firstElementChild.remove();
  }

  setTimeout(() => node.remove(), duration);
}

export function isDialogOpen() {
  return Boolean(activeDialog?.open);
}

export function openDialog(html, { className = "", onClose = null } = {}) {
  closeDialog();
  const root = modalRoot();
  if (!root) return null;
  const dialog = document.createElement("dialog");
  dialog.className = `modal ${className}`.trim();
  dialog.innerHTML = html;
  root.append(dialog);
  document.body.classList.add("has-open-dialog");
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("close", () => {
    if (activeDialog === dialog) activeDialog = null;
    if (!document.querySelector("dialog[open]")) {
      document.body.classList.remove("has-open-dialog");
    }
    dialog.remove();
    if (onClose) onClose();
  });
  dialog.showModal();
  activeDialog = dialog;
  const focusTarget = dialog.querySelector("[data-autofocus]") || dialog.querySelector("button, a, input, select, textarea");
  if (focusTarget) {
    requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
  }
  return dialog;
}

export function currentDialog() {
  return activeDialog;
}

export function closeDialog() {
  if (activeDialog?.open) {
    activeDialog.close();
  }
}

export function replaceDialogContent(html) {
  if (!activeDialog) return;
  activeDialog.innerHTML = html;
}

export function showFormError(form, message) {
  if (!form) return;
  let box = form.querySelector("[data-form-error]");
  if (!box) {
    box = document.createElement("div");
    box.className = "form-error";
    box.dataset.formError = "";
    box.setAttribute("role", "alert");
    form.prepend(box);
  }
  box.textContent = message;
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function clearFormError(form) {
  const box = form?.querySelector("[data-form-error]");
  if (box) {
    box.hidden = true;
    box.textContent = "";
  }
}

export function busy(button, label = "Please wait…") {
  const original = button.innerHTML;
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.classList.add("is-busy");
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
  return () => {
    button.disabled = wasDisabled;
    button.classList.remove("is-busy");
    button.innerHTML = original;
  };
}

export function confirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Go back",
  tone = "default",
  details = ""
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeDialog();
      resolve(value);
    };

    const dialog = openDialog(
      `<div class="confirm-card">
        <div class="confirm-icon ${tone === "danger" ? "is-danger" : ""}">${icon(tone === "danger" ? "alert-circle" : "info", 24)}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        ${details ? `<div class="confirm-details">${details}</div>` : ""}
        <div class="confirm-actions">
          <button type="button" class="btn btn-ghost" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn ${tone === "danger" ? "btn-danger" : "btn-primary"}" data-confirm-ok>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`,
      {
        className: "modal-small",
        onClose: () => {
          if (!settled) {
            settled = true;
            resolve(false);
          }
        }
      }
    );
    if (!dialog) {
      resolve(false);
      return;
    }
    dialog.querySelector("[data-confirm-cancel]").addEventListener("click", () => finish(false));
    dialog.querySelector("[data-confirm-ok]").addEventListener("click", () => finish(true));
  });
}
