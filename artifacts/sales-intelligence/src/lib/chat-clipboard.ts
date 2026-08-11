/**
 * 채팅 메시지 복사 유틸 — 3단 폴백.
 * 1) navigator.clipboard.writeText (보안 컨텍스트: https 또는 localhost)
 * 2) 화면 밖 textarea + document.execCommand('copy')
 * 3) 둘 다 실패하면 호출부가 안내 UI를 띄우도록 시그널만 반환
 *
 * 텍스트는 절대 변형하지 않는다(trim, 개행 치환 등 금지) — 복사 왕복 시 원문과 100% 동일해야 함.
 */
export type CopyResult = "clipboard" | "execCommand" | "selection-fallback";

export async function copyText(text: string): Promise<CopyResult> {
  // 1) Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    } catch {
      // 폴백으로 진행
    }
  }

  // 2) execCommand('copy') — 화면 밖 textarea 사용
  if (typeof document !== "undefined") {
    try {
      const selection = document.getSelection();
      const existingRanges: Range[] = [];
      if (selection) {
        for (let i = 0; i < selection.rangeCount; i++) {
          existingRanges.push(selection.getRangeAt(i).cloneRange());
        }
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);

      textarea.select();
      textarea.setSelectionRange(0, text.length); // iOS 대응

      let succeeded = false;
      try {
        succeeded = document.execCommand("copy");
      } catch {
        succeeded = false;
      }

      document.body.removeChild(textarea);

      // 기존 사용자 선택 영역 복원
      if (selection) {
        selection.removeAllRanges();
        for (const range of existingRanges) {
          selection.addRange(range);
        }
      }

      if (succeeded) {
        return "execCommand";
      }
    } catch {
      // 폴백으로 진행
    }
  }

  // 3) 둘 다 실패 — 호출부가 안내 UI를 띄우도록 시그널 반환
  return "selection-fallback";
}
