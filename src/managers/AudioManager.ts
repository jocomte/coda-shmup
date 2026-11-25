import { Plugins, Sound } from 'phaser';
import GameConstants from '../GameConstants.ts';
import SaveConstants, { type AudioSettingsData } from '../SaveConstants.ts';
import SaveManager from './SaveManager.ts';

export default class AudioManager extends Plugins.BasePlugin {
    public static readonly PLUGIN_KEY: string = 'AudioManager';
    public static readonly MAPPING_NAME: string = 'audioManager';

    private _musicVolume: number = 0.45;
    private _sfxVolume: number = 0.65;
    private _muted: boolean = false;
    private _ducked: boolean = false;
    private _bgm?: Sound.BaseSound;
    private _unlockHooked: boolean = false;

    public get musicVolume(): number {
        return this._musicVolume;
    }

    public get sfxVolume(): number {
        return this._sfxVolume;
    }

    public get muted(): boolean {
        return this._muted;
    }

    constructor(pluginManager: Plugins.PluginManager) {
        super(pluginManager);
        console.log('[AudioManager] Initialized');
    }

    public initSettingsFromSave(): void {
        const saveManager = this.getSaveManager();
        const saved = saveManager?.getData(SaveConstants.Keys.AUDIO_SETTINGS) as Partial<AudioSettingsData> | undefined;
        if (saved) {
            if (typeof saved.musicVolume === 'number') {
                this._musicVolume = Phaser.Math.Clamp(saved.musicVolume, 0, 1);
            }
            if (typeof saved.sfxVolume === 'number') {
                this._sfxVolume = Phaser.Math.Clamp(saved.sfxVolume, 0, 1);
            }
            if (typeof saved.muted === 'boolean') {
                this._muted = saved.muted;
            }
        }
        this.applySoundSettings(false);
    }

    public ensureMusicStarted(): void {
        if (!this.game.cache.audio.exists('bgm_scifi')) {
            return;
        }

        if (!this._bgm) {
            this._bgm = this.game.sound.add('bgm_scifi', {
                loop: true,
                volume: this.getEffectiveMusicVolume(),
            });
        }

        if (this.game.sound.locked) {
            if (!this._unlockHooked) {
                this._unlockHooked = true;
                this.game.sound.once(Sound.Events.UNLOCKED, () => {
                    this._unlockHooked = false;
                    if (this._bgm && !this._bgm.isPlaying) {
                        this._bgm.play({ loop: true, volume: this.getEffectiveMusicVolume() });
                    }
                });
            }
            return;
        }

        if (!this._bgm.isPlaying) {
            this._bgm.play({ loop: true, volume: this.getEffectiveMusicVolume() });
        } else {
            this.syncBgmVolume();
        }
    }

    public setMusicVolume(volume: number): void {
        this._musicVolume = Phaser.Math.Clamp(Math.round(volume * 100) / 100, 0, 1);
        if (this._musicVolume > 0 && this._muted) {
            this._muted = false;
        }
        this.applySoundSettings(true);
    }

    public setSfxVolume(volume: number): void {
        this._sfxVolume = Phaser.Math.Clamp(Math.round(volume * 100) / 100, 0, 1);
        if (this._sfxVolume > 0 && this._muted) {
            this._muted = false;
        }
        this.applySoundSettings(true);
    }

    public setMuted(muted: boolean): void {
        this._muted = muted;
        this.applySoundSettings(true);
    }

    public toggleMute(): boolean {
        this.setMuted(!this._muted);
        return this._muted;
    }

    public setDucked(ducked: boolean): void {
        this._ducked = ducked;
        this.syncBgmVolume();
    }

    public playSfx(key: string, baseVolume: number = 1.0): void {
        if (this._muted || this._sfxVolume <= 0) return;
        if (!this.game.cache.audio.exists(key)) return;
        if (this.game.sound.locked) return;

        this.game.sound.play(key, {
            volume: Phaser.Math.Clamp(baseVolume * this._sfxVolume, 0, 1),
        });
    }

    private getEffectiveMusicVolume(): number {
        if (this._muted) return 0;
        return this._musicVolume * (this._ducked ? 0.35 : 1.0);
    }

    private syncBgmVolume(): void {
        if (this._bgm && 'setVolume' in this._bgm && typeof (this._bgm as Sound.WebAudioSound).setVolume === 'function') {
            (this._bgm as Sound.WebAudioSound).setVolume(this.getEffectiveMusicVolume());
        }
    }

    private applySoundSettings(persist: boolean): void {
        this.game.sound.mute = this._muted;
        this.syncBgmVolume();

        if (persist) {
            const saveManager = this.getSaveManager();
            saveManager?.setData(SaveConstants.Keys.AUDIO_SETTINGS, {
                musicVolume: this._musicVolume,
                sfxVolume: this._sfxVolume,
                muted: this._muted,
            } satisfies AudioSettingsData);
        }

        this.game.events.emit(GameConstants.Events.AUDIO_CHANGED_EVENT, {
            musicVolume: this._musicVolume,
            sfxVolume: this._sfxVolume,
            muted: this._muted,
        } satisfies AudioSettingsData);
    }

    private getSaveManager(): SaveManager | undefined {
        return this.game.plugins.get(SaveManager.PLUGIN_KEY) as SaveManager | undefined;
    }
}
