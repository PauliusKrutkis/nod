/**
 * Skills, and where they come from. A skill is a `SKILL.md` file with YAML
 * frontmatter; Nod reads them from two places and this dialog says which is
 * which — the reviewed repo's own `.claude/skills`, which travels with the
 * code and outranks a name clash, and your personal folder, which follows you
 * into every repo.
 *
 * Deliberately not an installer. Fetching prompt files from a registry and
 * running them against your code is a supply-chain decision, not a
 * convenience, and it is not one this dialog should make on your behalf: a
 * skill is instructions the model follows over your repository. Creating one
 * from a scaffold and opening the folder covers the same ground with nothing
 * arriving unread — paste a skill you trust into the folder and it is picked
 * up on the next send.
 *
 * The list is the host's; naming a new skill is this dialog's own state, and
 * it validates the same way the filesystem does, so the error explains the
 * rule rather than reporting a failed write after the fact.
 */
import { FolderOpen, Plus, Wrench } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./skills-dialog.css";

export interface SkillRow {
  description: string;
  name: string;
  source: "repo" | "personal" | "built-in";
}

export interface SkillsDialogProps {
  inline?: boolean;
  onCreate: (name: string) => void;
  onOpenFolder: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  skills: readonly SkillRow[];
}

const NAME_RULE = /^[a-z0-9][a-z0-9-]*$/;

function nameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  if (!NAME_RULE.test(trimmed)) {
    return "Lower-case letters, numbers and dashes — it becomes a folder name.";
  }
  return null;
}

export function SkillsDialog(props: SkillsDialogProps) {
  if (!props.open) {
    return null;
  }
  return <SkillsDialogContent {...props} />;
}

function SkillsDialogContent({
  inline = false,
  onCreate,
  onOpenChange,
  onOpenFolder,
  skills,
}: SkillsDialogProps) {
  const [name, setName] = useState("");
  const close = () => onOpenChange(false);
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    close,
    undefined,
    { modal: !inline }
  );
  const error = nameError(name);
  const canCreate = name.trim() !== "" && error === null;

  const create = () => {
    if (!canCreate) {
      return;
    }
    onCreate(name.trim());
    setName("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      create();
    }
  };

  return (
    <dialog
      aria-label="Skills"
      className={cn("qsk q-dialog", inline && "qsk-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qsk-head">
        <Wrench aria-hidden size={15} />
        <h2 className="qsk-title">Skills</h2>
      </div>

      <p className="qsk-lede">
        A skill is a <code>SKILL.md</code> file the model follows when you
        invoke it with <code>/</code>. Nod reads them from this repository's{" "}
        <code>.claude/skills</code> and from your own folder.
      </p>

      <p className="qsk-lede">
        Not sure what you need? Send <code>/find-skill</code> in the chat — it
        looks for one that already fits, and writes a new one with you if none
        does.
      </p>

      {skills.length === 0 ? (
        <p className="qsk-empty">
          No skills yet. Name one below and Nod writes the file for you.
        </p>
      ) : (
        <ul className="qsk-list">
          {skills.map((skill) => (
            <li className="qsk-row" key={`${skill.source}-${skill.name}`}>
              <span className="qsk-name">/{skill.name}</span>
              <span className="qsk-where">{skill.source}</span>
              <span className="qsk-desc">{skill.description}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="qsk-new">
        <input
          aria-label="New skill name"
          className="qsk-input q-focus"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="review-pass"
          spellCheck={false}
          value={name}
        />
        <Button disabled={!canCreate} onClick={create} variant="primary">
          <Plus aria-hidden size={13} /> Create
        </Button>
      </div>
      {error !== null && <p className="qsk-error">{error}</p>}

      <div className="qsk-foot">
        <button
          className="qsk-link q-focus"
          onClick={onOpenFolder}
          type="button"
        >
          <FolderOpen aria-hidden size={13} /> Open skills folder
        </button>
        <Button onClick={close} variant="quiet">
          Done
        </Button>
      </div>
    </dialog>
  );
}
