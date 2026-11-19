"use client";
import { useRef } from "react";
import { ArrowRight, BookOpen, Check, X } from "lucide-react";

export function WorkspaceGuide() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className="button button-secondary"
        onClick={() => dialog.current?.showModal()}
      >
        <BookOpen size={16} />
        Workspace guide
      </button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby="guide-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="dialog-header">
          <span className="eyebrow">GETTING STARTED</span>
          <button
            className="icon-button"
            aria-label="Close guide"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="guide-title">A clear view of your operations.</h2>
        <p className="muted">
          Create customer orders, manage pickup locations and import
          spreadsheets. Customer accounts can access only their own business
          records.
        </p>
        <ul className="guide-list">
          <li>
            <Check />
            Explore activity and filter the overview.
          </li>
          <li>
            <Check />
            Update your name in Workspace settings.
          </li>
          <li>
            <Check />
            Admins can inspect team roles and access.
          </li>
        </ul>
        <div className="notice">
          Imports and order preparation work locally. Simulated booking and tracking work locally. No live
          carrier is connected and no real shipments are created here.
        </div>
        <button className="button" onClick={() => dialog.current?.close()}>
          Got it <ArrowRight size={16} />
        </button>
      </dialog>
    </>
  );
}
