/**
 * 音訊服務(BGM + 短音效)。
 *
 * 設計:
 *  - 用 HTMLAudioElement,簡單 + 廣相容,夠用
 *  - 瀏覽器 autoplay 政策:BGM 不能首次自動播,得等到使用者第一次互動(任何點擊)
 *    才可解鎖。`unlockOnce()` 由 App 在第一次 pointerdown 呼叫
 *  - SFX(click / coin):每次播放 cloneNode 出獨立 audio,連點不會被打斷
 *  - mute 由 settings.soundEnabled 控制,App 監聽 settings 變動同步呼叫 setMuted
 */

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');

class AudioService {
  private bgm: HTMLAudioElement;
  private click: HTMLAudioElement;
  private coin: HTMLAudioElement;
  private muted = false;
  private unlocked = false;
  private bgmPlaying = false;

  constructor() {
    this.bgm = new Audio(`${BASE}assets/audio/bgm_guzheng.ogg`);
    this.bgm.loop = true;
    this.bgm.volume = 0.32;
    this.bgm.preload = 'auto';

    this.click = new Audio(`${BASE}assets/audio/click.ogg`);
    this.click.volume = 0.5;
    this.click.preload = 'auto';

    this.coin = new Audio(`${BASE}assets/audio/coin.ogg`);
    this.coin.volume = 0.6;
    this.coin.preload = 'auto';
  }

  /**
   * 第一次 user gesture 後解鎖,啟動 BGM。
   * 重複呼叫沒事(unlocked flag 擋掉)。
   */
  unlockOnce(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.tryStartBgm();
  }

  /** 設定是否靜音(SettingsModal 切 + 初始從 settings.soundEnabled 載入) */
  setMuted(v: boolean): void {
    if (this.muted === v) return;
    this.muted = v;
    if (this.muted) {
      this.bgm.pause();
      this.bgmPlaying = false;
    } else if (this.unlocked) {
      this.tryStartBgm();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  playClick(): void {
    this.playClone(this.click);
  }

  playCoin(): void {
    this.playClone(this.coin);
  }

  private tryStartBgm() {
    if (this.muted || this.bgmPlaying) return;
    this.bgm.play().then(
      () => {
        this.bgmPlaying = true;
      },
      () => {
        // autoplay 還是被擋(罕見:user gesture 不夠近);下次 unlockOnce 再試
        this.bgmPlaying = false;
      }
    );
  }

  private playClone(template: HTMLAudioElement) {
    if (this.muted) return;
    const clip = template.cloneNode(true) as HTMLAudioElement;
    clip.volume = template.volume;
    clip.play().catch(() => {
      // ignored — user 還沒互動 / 瀏覽器擋
    });
  }
}

export const audio = new AudioService();
