// export const DIALOG_MESSAGES = {
//   PHASE_TRANSITION: {
//     PHASE_1_START: '対話を開始しました。',
//     PHASE_2_START: 'フェーズ2に移行しました。',
//     PHASE_3_START: 'フェーズ3に移行しました。',
//   },
//   COMPLETION: {
//     USER_MESSAGE: 'ユーザーの発話が完了しました。',
//     AI_MESSAGE: 'AIの応答が完了しました。',
//     DIALOG_PROGRESS: '対話が進みました。',
//   },
//   ERROR: {
//     PHASE_TRANSITION_FAILED: 'フェーズ遷移に失敗しました。',
//     PROMPT_NOT_FOUND: 'プロンプトが見つかりません。',
//     INVALID_PHASE: '無効なフェーズです。',
//   },
// } as const;

// export type DialogMessageKey = keyof typeof DIALOG_MESSAGES;
// export type DialogMessageSubKey<T extends DialogMessageKey> = keyof typeof DIALOG_MESSAGES[T];