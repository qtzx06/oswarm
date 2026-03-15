export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

export class WorktreeManager {
  constructor(private baseDir: string) {}

  async create(branchName: string): Promise<string> {
    const path = `${this.baseDir}/${branchName}`;
    const result = await Bun.$`git worktree add ${path} -b ${branchName}`.quiet();
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create worktree: ${result.stderr.toString()}`);
    }
    return path;
  }

  async remove(branchName: string): Promise<void> {
    const path = `${this.baseDir}/${branchName}`;
    await Bun.$`git worktree remove ${path} --force`.quiet();
    await Bun.$`git branch -D ${branchName}`.quiet();
  }

  async list(): Promise<WorktreeInfo[]> {
    const result = await Bun.$`git worktree list --porcelain`.quiet();
    const text = result.stdout.toString();
    const entries: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of text.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) entries.push(current as WorktreeInfo);
        current = { path: line.slice(9) };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice(5);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice(7);
      }
    }
    if (current.path) entries.push(current as WorktreeInfo);

    return entries;
  }
}
