import { Notice } from "obsidian"

export const errorNotice = (text: string) => {
    const n = new Notice(text)
    const el = ((n as any).messageEl ?? (n as any).noticeEl) as HTMLElement | undefined;
    el?.classList.add('sqlseal-notice-error')
    return n
}