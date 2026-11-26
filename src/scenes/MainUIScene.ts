import { GameObjects, Scenes, Scene } from "phaser";
import Health from "../components/Health.ts";
import Player, {
    type ActivePowerUpStatus,
    type ComboStatus,
    type DashStatus,
    type ExpStatus,
    type OverdriveStatus,
} from "../entities/Player.ts";
import { getMapZoneForSector, type MapZoneConfig } from "../gameData/MapZonesData.ts";
import AudioManager from "../managers/AudioManager.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import { isGamepadConnected } from "../utils/GamepadUtils.ts";
import { drawChamferPanel, drawChamferRectTopLeft, drawCornerBrackets } from "../utils/UITheme.ts";
import type MainGameScene from "./MainGameScene.ts";

type RadarSnapshot = {
    player: { nx: number; ny: number };
    enemies: Array<{ nx: number; ny: number; isBoss?: boolean }>;
    powerUps: Array<{ nx: number; ny: number }>;
};

type BossStatus = {
    active: boolean;
    name: string;
    current: number;
    max: number;
};

type SectorChangedPayload = {
    sectorNumber: number;
    zone: MapZoneConfig;
    isWarp?: boolean;
};

export default class MainUIScene extends Scene {
    private static readonly EXP_BAR_WIDTH: number = 1000;
    private static readonly EXP_BAR_HEIGHT: number = 38;
    private static readonly HP_BAR_WIDTH: number = 468;
    private static readonly HP_BAR_HEIGHT: number = 42;
    private static readonly SUB_BAR_WIDTH: number = 226;
    private static readonly SUB_BAR_HEIGHT: number = 26;
    private static readonly BOSS_BAR_WIDTH: number = 760;
    private static readonly BOSS_BAR_HEIGHT: number = 30;
    private static readonly RADAR_SIZE: number = 184;

    private _expBarFill!: GameObjects.Rectangle;
    private _expBarText!: GameObjects.Text;

    private _hpBarFill!: GameObjects.Rectangle;
    private _hpBarText!: GameObjects.Text;

    private _dashBarFill!: GameObjects.Rectangle;
    private _dashText!: GameObjects.Text;

    private _overdriveBarFill!: GameObjects.Rectangle;
    private _overdriveText!: GameObjects.Text;

    private _bossGroup!: GameObjects.Container;
    private _bossBarFill!: GameObjects.Rectangle;
    private _bossNameText!: GameObjects.Text;

    private _scoreText!: GameObjects.BitmapText;
    private _comboText!: GameObjects.Text;
    private _powerUpsText!: GameObjects.Text;
    private _muteBtnGfx!: GameObjects.Graphics;
    private _muteBtnText!: GameObjects.Text;
    private _gamepadBadge!: GameObjects.Container;
    private _sectorBadgeGfx!: GameObjects.Graphics;
    private _sectorDot!: GameObjects.Arc;
    private _sectorBadgeText!: GameObjects.Text;
    private _radarGraphics!: GameObjects.Graphics;
    private _radarOriginX: number = 0;
    private _radarOriginY: number = 0;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_UI);
    }

    // noinspection JSUnusedGlobalSymbols
    init() {
        this.game.events.on(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
        this.game.events.on(GameConstants.Events.EXP_CHANGED_EVENT, this.onExpChanged, this);
        this.game.events.on(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
        this.game.events.on(GameConstants.Events.RADAR_UPDATE_EVENT, this.onRadarUpdate, this);
        this.game.events.on(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshMuteLabel, this);
        this.game.events.on(GameConstants.Events.DASH_CHANGED_EVENT, this.onDashChanged, this);
        this.game.events.on(GameConstants.Events.OVERDRIVE_CHANGED_EVENT, this.onOverdriveChanged, this);
        this.game.events.on(GameConstants.Events.COMBO_CHANGED_EVENT, this.onComboChanged, this);
        this.game.events.on(GameConstants.Events.BOSS_STATUS_EVENT, this.onBossStatus, this);
        this.game.events.on(GameConstants.Events.BOSS_ALERT_EVENT, this.onBossAlert, this);
        this.game.events.on(GameConstants.Events.SECTOR_CHANGED_EVENT, this.onSectorChanged, this);
        this.registry.events.on(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
            this.game.events.off(GameConstants.Events.EXP_CHANGED_EVENT, this.onExpChanged, this);
            this.game.events.off(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
            this.game.events.off(GameConstants.Events.RADAR_UPDATE_EVENT, this.onRadarUpdate, this);
            this.game.events.off(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshMuteLabel, this);
            this.game.events.off(GameConstants.Events.DASH_CHANGED_EVENT, this.onDashChanged, this);
            this.game.events.off(GameConstants.Events.OVERDRIVE_CHANGED_EVENT, this.onOverdriveChanged, this);
            this.game.events.off(GameConstants.Events.COMBO_CHANGED_EVENT, this.onComboChanged, this);
            this.game.events.off(GameConstants.Events.BOSS_STATUS_EVENT, this.onBossStatus, this);
            this.game.events.off(GameConstants.Events.BOSS_ALERT_EVENT, this.onBossAlert, this);
            this.game.events.off(GameConstants.Events.SECTOR_CHANGED_EVENT, this.onSectorChanged, this);
            this.registry.events.off(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);
        }, this);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        const marginX = 40;
        const rightX = this.scale.width - marginX;
        const hudGfx = this.add.graphics();

        // 1. EXP Bar (full top width)
        const expY = 22;
        drawChamferRectTopLeft(hudGfx, marginX, expY, MainUIScene.EXP_BAR_WIDTH, MainUIScene.EXP_BAR_HEIGHT, {
            cut: 10,
            fillColor: 0x0b1324,
            fillAlpha: 0.9,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.85,
            lineWidth: 2,
        });

        this._expBarFill = this.add.rectangle(
            marginX + 4,
            expY + 4,
            0,
            MainUIScene.EXP_BAR_HEIGHT - 8,
            0x0ea5e9,
            1
        ).setOrigin(0, 0);

        // Specular gloss & segment ticks across EXP bar
        this.add.rectangle(
            marginX + 6,
            expY + 5,
            MainUIScene.EXP_BAR_WIDTH - 12,
            6,
            0xffffff,
            0.16
        ).setOrigin(0, 0);
        hudGfx.lineStyle(1, 0xbae6fd, 0.16);
        for (let i = 1; i < 10; i++) {
            const tx = marginX + (MainUIScene.EXP_BAR_WIDTH / 10) * i;
            hudGfx.lineBetween(tx, expY + 5, tx, expY + MainUIScene.EXP_BAR_HEIGHT - 5);
        }

        this._expBarText = this.add.text(
            marginX + MainUIScene.EXP_BAR_WIDTH / 2,
            expY + MainUIScene.EXP_BAR_HEIGHT / 2,
            "LVL 1  •  0 / 4 XP",
            {
                fontSize: '21px',
                fontFamily: 'future, sans-serif',
                color: '#f8fafc',
                stroke: '#020617',
                strokeThickness: 4,
            }
        ).setOrigin(0.5);

        // 2. Health Bar (top-left below EXP bar)
        const hpY = 76;
        drawChamferRectTopLeft(hudGfx, marginX, hpY, MainUIScene.HP_BAR_WIDTH, MainUIScene.HP_BAR_HEIGHT, {
            cut: 10,
            fillColor: 0x0b1324,
            fillAlpha: 0.9,
            strokeColor: 0x475569,
            strokeAlpha: 0.95,
            lineWidth: 2,
        });

        this._hpBarFill = this.add.rectangle(
            marginX + 4,
            hpY + 4,
            MainUIScene.HP_BAR_WIDTH - 8,
            MainUIScene.HP_BAR_HEIGHT - 8,
            0x22c55e,
            1
        ).setOrigin(0, 0);

        this.add.rectangle(
            marginX + 6,
            hpY + 5,
            MainUIScene.HP_BAR_WIDTH - 12,
            7,
            0xffffff,
            0.18
        ).setOrigin(0, 0);

        this._hpBarText = this.add.text(
            marginX + MainUIScene.HP_BAR_WIDTH / 2,
            hpY + MainUIScene.HP_BAR_HEIGHT / 2,
            "HP 100 / 100",
            {
                fontSize: '21px',
                fontFamily: 'future, sans-serif',
                color: '#ffffff',
                stroke: '#020617',
                strokeThickness: 4,
            }
        ).setOrigin(0.5);

        // 3. Dash Gauge & Overdrive Gauge cleanly paired below HP
        const subY = 128;
        drawChamferRectTopLeft(hudGfx, marginX, subY, MainUIScene.SUB_BAR_WIDTH, MainUIScene.SUB_BAR_HEIGHT, {
            cut: 7,
            fillColor: 0x0b1324,
            fillAlpha: 0.9,
            strokeColor: 0x2dd4bf,
            strokeAlpha: 0.8,
            lineWidth: 2,
        });
        this._dashBarFill = this.add.rectangle(
            marginX + 3,
            subY + 3,
            MainUIScene.SUB_BAR_WIDTH - 6,
            MainUIScene.SUB_BAR_HEIGHT - 6,
            0x2dd4bf,
            1
        ).setOrigin(0, 0);
        this._dashText = this.add.text(
            marginX + MainUIScene.SUB_BAR_WIDTH / 2,
            subY + MainUIScene.SUB_BAR_HEIGHT / 2,
            "DASH PRÊT [SHIFT]",
            {
                fontSize: '14px',
                fontFamily: 'future, sans-serif',
                color: '#ffffff',
                stroke: '#020617',
                strokeThickness: 3,
            }
        ).setOrigin(0.5);

        const odX = marginX + MainUIScene.SUB_BAR_WIDTH + 16;
        drawChamferRectTopLeft(hudGfx, odX, subY, MainUIScene.SUB_BAR_WIDTH, MainUIScene.SUB_BAR_HEIGHT, {
            cut: 7,
            fillColor: 0x0b1324,
            fillAlpha: 0.9,
            strokeColor: 0xfacc15,
            strokeAlpha: 0.8,
            lineWidth: 2,
        });
        this._overdriveBarFill = this.add.rectangle(
            odX + 3,
            subY + 3,
            0,
            MainUIScene.SUB_BAR_HEIGHT - 6,
            0xfacc15,
            1
        ).setOrigin(0, 0);
        this._overdriveText = this.add.text(
            odX + MainUIScene.SUB_BAR_WIDTH / 2,
            subY + MainUIScene.SUB_BAR_HEIGHT / 2,
            "OVERDRIVE 0%",
            {
                fontSize: '14px',
                fontFamily: 'future, sans-serif',
                color: '#ffffff',
                stroke: '#020617',
                strokeThickness: 3,
            }
        ).setOrigin(0.5);

        // 4. Score & Quick Controls (top-right)
        this.add.text(rightX, 72, 'SCORE', {
            fontSize: '16px',
            fontFamily: 'future, sans-serif',
            color: '#94a3b8',
            stroke: '#020617',
            strokeThickness: 3,
        }).setOrigin(1, 0);

        let scoreStr: string = "".padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        if (this.registry.has(RegistryConstants.Keys.PLAYER_SCORE))
            scoreStr = this.registry.get(RegistryConstants.Keys.PLAYER_SCORE).toString()
                .padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText = this.add.bitmapText(rightX, 90, "future-bmp", scoreStr, 76)
            .setOrigin(1, 0);

        this._comboText = this.add.text(rightX, 174, "", {
            fontSize: '22px',
            fontFamily: 'future, sans-serif',
            color: '#facc15',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(1, 0);

        // Quick Pause & Mute chamfered buttons
        const pauseCx = rightX - 78;
        const btnY = 232;
        const pauseGfx = this.add.graphics();
        const drawPauseBtn = (hovered: boolean) => {
            pauseGfx.clear();
            drawChamferPanel(pauseGfx, pauseCx, btnY, 156, 44, {
                cut: 10,
                fillColor: hovered ? 0x1e293b : 0x0b1324,
                fillAlpha: 0.92,
                strokeColor: hovered ? 0x7dd3fc : 0x38bdf8,
                strokeAlpha: 0.9,
                lineWidth: 2,
            });
        };
        drawPauseBtn(false);
        this.add.text(pauseCx, btnY, 'PAUSE', {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0.5);
        const pauseHit = this.add.rectangle(pauseCx, btnY, 156, 44, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        pauseHit.on('pointerover', () => drawPauseBtn(true));
        pauseHit.on('pointerout', () => drawPauseBtn(false));
        pauseHit.on('pointerdown', () => {
            const gameScene = this.scene.get(GameConstants.SceneKeys.MAIN_GAME) as MainGameScene | undefined;
            gameScene?.openPauseModal();
        });

        const muteCx = rightX - 246;
        this._muteBtnGfx = this.add.graphics();
        this._muteBtnText = this.add.text(muteCx, btnY, 'SON ON', {
            fontSize: '19px',
            fontFamily: 'future, sans-serif',
            color: '#4ade80',
        }).setOrigin(0.5);
        const muteHit = this.add.rectangle(muteCx, btnY, 152, 44, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        muteHit.on('pointerdown', () => {
            const audio = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
            audio?.toggleMute();
            this.refreshMuteLabel();
        });
        this.refreshMuteLabel();

        // Active temporary power-ups
        this._powerUpsText = this.add.text(marginX, 170, "", {
            fontSize: '22px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
            stroke: '#020617',
            strokeThickness: 4,
            lineSpacing: 6,
        }).setOrigin(0, 0);

        // 5. Boss HP Bar container
        this._bossGroup = this.add.container(this.scale.width / 2, 304).setVisible(false);
        const bossGfx = this.add.graphics();
        drawChamferPanel(bossGfx, 0, 0, MainUIScene.BOSS_BAR_WIDTH, MainUIScene.BOSS_BAR_HEIGHT, {
            cut: 10,
            fillColor: 0x0b1324,
            fillAlpha: 0.94,
            strokeColor: 0xf43f5e,
            strokeAlpha: 0.95,
            lineWidth: 3,
            brackets: true,
            bracketLen: 14,
            bracketColor: 0xfda4af,
        });
        this._bossBarFill = this.add.rectangle(
            -MainUIScene.BOSS_BAR_WIDTH / 2 + 5,
            0,
            MainUIScene.BOSS_BAR_WIDTH - 10,
            MainUIScene.BOSS_BAR_HEIGHT - 10,
            0xf43f5e,
            1
        ).setOrigin(0, 0.5);
        const bossGloss = this.add.rectangle(0, -MainUIScene.BOSS_BAR_HEIGHT / 2 + 7, MainUIScene.BOSS_BAR_WIDTH - 16, 6, 0xffffff, 0.16);
        this._bossNameText = this.add.text(0, -32, 'BOSS', {
            fontSize: '22px',
            fontFamily: 'future, sans-serif',
            color: '#fda4af',
            stroke: '#020617',
            strokeThickness: 5,
        }).setOrigin(0.5);
        this._bossGroup.add([bossGfx, this._bossBarFill, bossGloss, this._bossNameText]);

        // 6. Tactical Mini-Radar (bottom-right)
        this._radarOriginX = this.scale.width - MainUIScene.RADAR_SIZE - 36;
        this._radarOriginY = this.scale.height - MainUIScene.RADAR_SIZE - 36;
        const radarFrame = this.add.graphics();
        drawChamferRectTopLeft(radarFrame, this._radarOriginX, this._radarOriginY, MainUIScene.RADAR_SIZE, MainUIScene.RADAR_SIZE, {
            cut: 12,
            fillColor: 0x0b1324,
            fillAlpha: 0.84,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.72,
            lineWidth: 2,
            brackets: true,
            bracketLen: 16,
            bracketColor: 0x7dd3fc,
        });
        this.add.text(this._radarOriginX + MainUIScene.RADAR_SIZE / 2, this._radarOriginY - 16, 'RADAR TACTIQUE', {
            fontSize: '14px',
            fontFamily: 'future, sans-serif',
            color: '#7dd3fc',
            stroke: '#020617',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this._radarGraphics = this.add.graphics();

        // 7. Bottom-Left Sector Telemetry Badge + Gamepad Pill (zero overlap anywhere)
        const initialZone = getMapZoneForSector(1);
        this._sectorBadgeGfx = this.add.graphics();
        this._sectorDot = this.add.circle(58, this.scale.height - 96, 7, initialZone.borderInnerColor, 1);
        this._sectorBadgeText = this.add.text(
            78,
            this.scale.height - 96,
            `SECTEUR 1 : ${initialZone.name}`,
            {
                fontSize: '18px',
                fontFamily: 'future, sans-serif',
                color: initialZone.accentHex,
                stroke: '#020617',
                strokeThickness: 4,
            }
        ).setOrigin(0, 0.5);
        this.drawSectorBadge(initialZone);

        this._gamepadBadge = this.add.container(36, this.scale.height - 40).setVisible(false);
        const gpBg = this.add.graphics();
        drawChamferRectTopLeft(gpBg, 0, -18, 250, 34, {
            cut: 8,
            fillColor: 0x064e3b,
            fillAlpha: 0.86,
            strokeColor: 0x4ade80,
            strokeAlpha: 0.9,
            lineWidth: 1.5,
        });
        const gpTxt = this.add.text(125, -1, 'MANETTE CONNECTÉE', {
            fontSize: '16px',
            fontFamily: 'future, sans-serif',
            color: '#86efac',
        }).setOrigin(0.5);
        this._gamepadBadge.add([gpBg, gpTxt]);

        this.scene.bringToTop();

        console.log("MainUIScene created");
    }

    private drawSectorBadge(zone: MapZoneConfig) {
        if (!this._sectorBadgeGfx) return;
        this._sectorBadgeGfx.clear();
        drawChamferRectTopLeft(this._sectorBadgeGfx, 36, this.scale.height - 120, 456, 48, {
            cut: 10,
            fillColor: 0x0b1324,
            fillAlpha: 0.88,
            strokeColor: zone.borderInnerColor,
            strokeAlpha: 0.88,
            lineWidth: 2,
        });
    }

    update() {
        if (this._gamepadBadge) {
            this._gamepadBadge.setVisible(isGamepadConnected(this));
        }
    }

    private refreshMuteLabel() {
        if (!this._muteBtnText || !this._muteBtnGfx) return;
        const audio = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        const muteCx = this.scale.width - 40 - 246;
        const btnY = 232;
        const muted = Boolean(audio?.muted);

        this._muteBtnGfx.clear();
        drawChamferPanel(this._muteBtnGfx, muteCx, btnY, 152, 44, {
            cut: 10,
            fillColor: 0x0b1324,
            fillAlpha: 0.92,
            strokeColor: muted ? 0xf87171 : 0x4ade80,
            strokeAlpha: 0.85,
            lineWidth: 2,
        });

        if (muted) {
            this._muteBtnText.setText('SON OFF').setColor('#f87171');
        } else {
            this._muteBtnText.setText('SON ON').setColor('#4ade80');
        }
    }

    private onDashChanged(status: DashStatus) {
        if (!this._dashBarFill || !this._dashText) return;
        this._dashBarFill.width = (MainUIScene.SUB_BAR_WIDTH - 6) * status.readyRatio;
        if (status.isReady) {
            this._dashBarFill.setFillStyle(0x2dd4bf);
            this._dashText.setText('DASH PRÊT [SHIFT]');
        } else {
            this._dashBarFill.setFillStyle(0x0f766e);
            this._dashText.setText('RECHARGE...');
        }
    }

    private onOverdriveChanged(status: OverdriveStatus) {
        if (!this._overdriveBarFill || !this._overdriveText) return;
        const ratio = Phaser.Math.Clamp(status.value / 100, 0, 1);
        this._overdriveBarFill.width = (MainUIScene.SUB_BAR_WIDTH - 6) * ratio;

        if (status.active) {
            this._overdriveBarFill.setFillStyle(0xf97316);
            const sec = Math.ceil(status.remainingMs / 1000);
            this._overdriveText.setText(`OVERDRIVE ${sec}s !`);
        } else {
            this._overdriveBarFill.setFillStyle(0xfacc15);
            this._overdriveText.setText(`OVERDRIVE ${Math.floor(status.value)}%`);
        }
    }

    private onComboChanged(status: ComboStatus) {
        if (!this._comboText) return;
        if (status.count < 2) {
            this._comboText.setText('');
            return;
        }
        this._comboText.setText(`COMBO ${status.count}  •  x${status.multiplier}`);
    }

    private onBossStatus(status: BossStatus) {
        if (!this._bossGroup || !this._bossBarFill || !this._bossNameText) return;
        this._bossGroup.setVisible(status.active);
        if (!status.active) return;

        const ratio = status.max > 0 ? Phaser.Math.Clamp(status.current / status.max, 0, 1) : 0;
        this._bossBarFill.width = (MainUIScene.BOSS_BAR_WIDTH - 10) * ratio;
        this._bossNameText.setText(`${status.name}  •  ${Math.max(0, status.current)} / ${status.max}`);
    }

    private onBossAlert(bossName: string) {
        const cx = this.scale.width / 2;
        const cy = 430;
        const alertContainer = this.add.container(cx, cy);
        const gfx = this.add.graphics();
        drawChamferPanel(gfx, 0, 0, 880, 108, {
            cut: 18,
            fillColor: 0x450a0a,
            fillAlpha: 0.94,
            strokeColor: 0xf43f5e,
            strokeAlpha: 1,
            lineWidth: 3,
            brackets: true,
            bracketLen: 18,
            bracketColor: 0xfda4af,
        });
        const warnTxt = this.add.text(0, -24, 'ALERTE MENACE DÉTECTÉE', {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: '#fda4af',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(0.5);
        const alertTxt = this.add.text(0, 14, `BOSS : ${bossName}`, {
            fontSize: '34px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
            stroke: '#020617',
            strokeThickness: 6,
        }).setOrigin(0.5);
        alertContainer.add([gfx, warnTxt, alertTxt]);

        this.tweens.add({
            targets: alertContainer,
            alpha: { from: 1, to: 0.25 },
            duration: 280,
            yoyo: true,
            repeat: 3,
            onComplete: () => alertContainer.destroy(),
        });
    }

    private onSectorChanged(payload: SectorChangedPayload) {
        const { sectorNumber, zone, isWarp } = payload;
        this.drawSectorBadge(zone);
        this._sectorDot?.setFillStyle(zone.borderInnerColor, 1);
        if (this._sectorBadgeText) {
            this._sectorBadgeText.setText(`SECTEUR ${sectorNumber} : ${zone.name}`);
            this._sectorBadgeText.setColor(zone.accentHex);
        }

        if (!isWarp) return;

        const cx = this.scale.width / 2;
        const cy = 370;
        const banner = this.add.container(cx, cy);
        const gfx = this.add.graphics();
        drawChamferPanel(gfx, 0, 0, 880, 132, {
            cut: 18,
            fillColor: 0x0b1324,
            fillAlpha: 0.95,
            strokeColor: zone.borderInnerColor,
            strokeAlpha: 1,
            lineWidth: 3,
            brackets: true,
            bracketLen: 18,
            bracketColor: zone.borderInnerColor,
        });
        const bannerTitle = this.add.text(
            0,
            -22,
            `WARP → SECTEUR ${sectorNumber} : ${zone.name}`,
            {
                fontSize: '29px',
                fontFamily: 'future, sans-serif',
                color: zone.accentHex,
                stroke: '#020617',
                strokeThickness: 6,
            }
        ).setOrigin(0.5);
        const bannerSub = this.add.text(
            0,
            24,
            `${zone.subtitle}  •  +20 HP RESTAURÉS`,
            {
                fontSize: '20px',
                fontFamily: 'future, sans-serif',
                color: '#e2e8f0',
                stroke: '#020617',
                strokeThickness: 4,
            }
        ).setOrigin(0.5);
        banner.add([gfx, bannerTitle, bannerSub]);

        this.tweens.add({
            targets: banner,
            alpha: 0,
            delay: 2050,
            duration: 550,
            onComplete: () => banner.destroy(),
        });
    }

    private onRadarUpdate(snapshot: RadarSnapshot) {
        if (!this._radarGraphics) return;

        const g = this._radarGraphics;
        const size = MainUIScene.RADAR_SIZE;
        const ox = this._radarOriginX;
        const oy = this._radarOriginY;
        const rcx = ox + size / 2;
        const rcy = oy + size / 2;

        g.clear();

        // Concentric range rings & tactical crosshairs
        g.lineStyle(1, 0x38bdf8, 0.16);
        g.strokeCircle(rcx, rcy, size * 0.22);
        g.strokeCircle(rcx, rcy, size * 0.42);
        g.lineBetween(rcx, oy + 8, rcx, oy + size - 8);
        g.lineBetween(ox + 8, rcy, ox + size - 8, rcy);

        // Power-ups (green dots)
        g.fillStyle(0x4ade80, 0.95);
        for (const p of snapshot.powerUps) {
            g.fillCircle(ox + p.nx * size, oy + p.ny * size, 3.5);
        }

        // Enemies (red dots, larger gold-rimmed marker for Boss)
        for (const e of snapshot.enemies) {
            const ex = ox + e.nx * size;
            const ey = oy + e.ny * size;
            if (e.isBoss) {
                g.fillStyle(0xfacc15, 1);
                g.fillCircle(ex, ey, 7.5);
                g.fillStyle(0xf43f5e, 1);
                g.fillCircle(ex, ey, 4.5);
            } else {
                g.fillStyle(0xf43f5e, 0.95);
                g.fillCircle(ex, ey, 3);
            }
        }

        // Player (bright cyan dot with ring)
        const px = ox + snapshot.player.nx * size;
        const py = oy + snapshot.player.ny * size;
        g.lineStyle(1.5, 0xbae6fd, 0.85);
        g.strokeCircle(px, py, 7.5);
        g.fillStyle(0x38bdf8, 1);
        g.fillCircle(px, py, 4.5);

        // Reinforce inner corner brackets cleanly
        drawCornerBrackets(g, ox, oy, size, size, 12, 0x38bdf8, 0.35, 1);
    }

    private onPlayerScoreChanged(_: unknown, value: number) {
        const scoreStr: string = value.toString().padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText.setText(scoreStr);
    }

    private onPlayerSpawned(player: Player) {
        this._powerUpsText?.setText("");
        this._bossGroup?.setVisible(false);
        this._comboText?.setText("");

        const health = player.getComponent(Health);
        if (health) {
            this.updateHealthBar(health.current, health.max);
            health.on(Health.CHANGE_EVENT, (current: number) => {
                this.updateHealthBar(current, health.max);
            }, this);
        }

        this.onExpChanged({
            level: player.level,
            exp: player.exp,
            expToNext: player.expToNext,
        });
    }

    private updateHealthBar(current: number, max: number) {
        if (!this._hpBarFill || !this._hpBarText) return;

        const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
        const innerMaxWidth = MainUIScene.HP_BAR_WIDTH - 8;
        this._hpBarFill.width = innerMaxWidth * ratio;

        if (ratio > 0.5) {
            this._hpBarFill.setFillStyle(0x22c55e);
        } else if (ratio > 0.25) {
            this._hpBarFill.setFillStyle(0xf59e0b);
        } else {
            this._hpBarFill.setFillStyle(0xef4444);
        }

        this._hpBarText.setText(`HP ${Math.max(0, current)} / ${max}`);
    }

    private onExpChanged(status: ExpStatus) {
        if (!this._expBarFill || !this._expBarText) return;

        const ratio = status.expToNext > 0 ? Phaser.Math.Clamp(status.exp / status.expToNext, 0, 1) : 0;
        const innerMaxWidth = MainUIScene.EXP_BAR_WIDTH - 8;
        this._expBarFill.width = innerMaxWidth * ratio;

        this._expBarText.setText(`LVL ${status.level}   •   ${status.exp} / ${status.expToNext} XP`);
    }

    private onPowerUpsChanged(activeBuffs: ActivePowerUpStatus[]) {
        if (!this._powerUpsText) return;

        if (activeBuffs.length === 0) {
            this._powerUpsText.setText("");
            return;
        }

        const lines = activeBuffs.map(buff => {
            const seconds = Math.ceil(buff.remainingMs / 1000);
            return `▸ ${buff.label} (${seconds}s)`;
        });

        this._powerUpsText.setText(lines.join('\n'));
    }
}
