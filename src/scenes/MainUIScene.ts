import { GameObjects, Scale, Scenes, Scene } from "phaser";
import Health from "../components/Health.ts";
import Player, {
    type ActivePowerUpStatus,
    type ComboStatus,
    type DashStatus,
    type ExpStatus,
    type OverdriveStatus,
} from "../entities/Player.ts";
import { getMapZoneForSector, type MapZoneConfig } from "../gameData/MapZonesData.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import { isGamepadConnected } from "../utils/GamepadUtils.ts";
import {
    createSettingsIconButton,
    drawChamferPanel,
    drawChamferRectTopLeft,
    drawCornerBrackets,
} from "../utils/UITheme.ts";
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
    private static readonly EXP_BAR_HEIGHT: number = 10;
    private static readonly HP_BAR_WIDTH: number = 316;
    private static readonly HP_BAR_HEIGHT: number = 34;
    private static readonly BOSS_BAR_WIDTH: number = 680;
    private static readonly BOSS_BAR_HEIGHT: number = 22;
    private static readonly RADAR_SIZE: number = 152;

    private _expBarBg!: GameObjects.Rectangle;
    private _expBarFill!: GameObjects.Rectangle;
    private _expRatio: number = 0;
    private _levelText!: GameObjects.Text;

    private _hpBarFill!: GameObjects.Rectangle;
    private _hpBarText!: GameObjects.Text;

    private _dashText!: GameObjects.Text;
    private _overdriveText!: GameObjects.Text;

    private _bossGroup!: GameObjects.Container;
    private _bossBarFill!: GameObjects.Rectangle;
    private _bossNameText!: GameObjects.Text;

    private _settingsBtn!: GameObjects.Container;
    private _scoreText!: GameObjects.BitmapText;
    private _comboText!: GameObjects.Text;
    private _powerUpsText!: GameObjects.Text;
    private _gamepadBadge!: GameObjects.Text;
    private _sectorDot!: GameObjects.Arc;
    private _sectorBadgeText!: GameObjects.Text;
    private _radarFrame!: GameObjects.Graphics;
    private _radarGraphics!: GameObjects.Graphics;
    private _radarOriginX: number = 0;
    private _radarOriginY: number = 0;
    private _lastRadarSnapshot?: RadarSnapshot;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_UI);
    }

    // noinspection JSUnusedGlobalSymbols
    init() {
        this.game.events.on(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
        this.game.events.on(GameConstants.Events.EXP_CHANGED_EVENT, this.onExpChanged, this);
        this.game.events.on(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
        this.game.events.on(GameConstants.Events.RADAR_UPDATE_EVENT, this.onRadarUpdate, this);
        this.game.events.on(GameConstants.Events.DASH_CHANGED_EVENT, this.onDashChanged, this);
        this.game.events.on(GameConstants.Events.OVERDRIVE_CHANGED_EVENT, this.onOverdriveChanged, this);
        this.game.events.on(GameConstants.Events.COMBO_CHANGED_EVENT, this.onComboChanged, this);
        this.game.events.on(GameConstants.Events.BOSS_STATUS_EVENT, this.onBossStatus, this);
        this.game.events.on(GameConstants.Events.BOSS_ALERT_EVENT, this.onBossAlert, this);
        this.game.events.on(GameConstants.Events.SECTOR_CHANGED_EVENT, this.onSectorChanged, this);
        this.registry.events.on(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);

        const onResize = (gameSize: Phaser.Structs.Size) => {
            this.layoutUI(gameSize.width, gameSize.height);
        };
        this.scale.on(Scale.Events.RESIZE, onResize, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.scale.off(Scale.Events.RESIZE, onResize, this);
            this.game.events.off(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
            this.game.events.off(GameConstants.Events.EXP_CHANGED_EVENT, this.onExpChanged, this);
            this.game.events.off(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
            this.game.events.off(GameConstants.Events.RADAR_UPDATE_EVENT, this.onRadarUpdate, this);
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
        const marginX = 28;
        const hudGfx = this.add.graphics();

        // 1. Slim EXP Ribbon at very top (resizes cleanly to full screen width)
        const expY = 14;
        this._expBarBg = this.add.rectangle(marginX, expY, 100, MainUIScene.EXP_BAR_HEIGHT, 0x0b1324, 0.85)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0x334155, 0.9);
        this._expBarFill = this.add.rectangle(
            marginX + 1,
            expY + 1,
            0,
            MainUIScene.EXP_BAR_HEIGHT - 2,
            0x38bdf8,
            1
        ).setOrigin(0, 0);

        // 2. Top-Left: Compact Level Pill + Single HP Bar + Minimal Status Line
        const topRowY = 38;
        drawChamferRectTopLeft(hudGfx, marginX, topRowY, 88, MainUIScene.HP_BAR_HEIGHT, {
            cut: 8,
            fillColor: 0x0b1324,
            fillAlpha: 0.9,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.85,
            lineWidth: 2,
        });
        this._levelText = this.add.text(marginX + 44, topRowY + MainUIScene.HP_BAR_HEIGHT / 2, "LVL 1", {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: '#7dd3fc',
        }).setOrigin(0.5);

        const hpX = marginX + 98;
        drawChamferRectTopLeft(hudGfx, hpX, topRowY, MainUIScene.HP_BAR_WIDTH, MainUIScene.HP_BAR_HEIGHT, {
            cut: 8,
            fillColor: 0x0b1324,
            fillAlpha: 0.9,
            strokeColor: 0x475569,
            strokeAlpha: 0.9,
            lineWidth: 2,
        });
        this._hpBarFill = this.add.rectangle(
            hpX + 3,
            topRowY + 3,
            MainUIScene.HP_BAR_WIDTH - 6,
            MainUIScene.HP_BAR_HEIGHT - 6,
            0x22c55e,
            1
        ).setOrigin(0, 0);
        this.add.rectangle(hpX + 5, topRowY + 4, MainUIScene.HP_BAR_WIDTH - 10, 5, 0xffffff, 0.16).setOrigin(0, 0);
        this._hpBarText = this.add.text(hpX + MainUIScene.HP_BAR_WIDTH / 2, topRowY + MainUIScene.HP_BAR_HEIGHT / 2, "100 / 100", {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(0.5);

        // Minimal Dash & Overdrive indicators directly underneath
        this._dashText = this.add.text(marginX, 82, '● DASH PRÊT [SHIFT]', {
            fontSize: '16px',
            fontFamily: 'future, sans-serif',
            color: '#2dd4bf',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(0, 0);

        this._overdriveText = this.add.text(marginX + 206, 82, '★ OVERDRIVE 0%', {
            fontSize: '16px',
            fontFamily: 'future, sans-serif',
            color: '#facc15',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(0, 0);

        this._powerUpsText = this.add.text(marginX, 110, "", {
            fontSize: '19px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
            stroke: '#020617',
            strokeThickness: 4,
            lineSpacing: 4,
        }).setOrigin(0, 0);

        // 3. Top-Right: Score + Settings/Pause Gear Icon Button
        this._settingsBtn = createSettingsIconButton(this, 0, 0, 50, () => {
            const gameScene = this.scene.get(GameConstants.SceneKeys.MAIN_GAME) as MainGameScene | undefined;
            gameScene?.openPauseModal();
        });

        let scoreStr: string = "".padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        if (this.registry.has(RegistryConstants.Keys.PLAYER_SCORE))
            scoreStr = this.registry.get(RegistryConstants.Keys.PLAYER_SCORE).toString()
                .padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText = this.add.bitmapText(0, 34, "future-bmp", scoreStr, 62)
            .setOrigin(1, 0);

        this._comboText = this.add.text(0, 102, "", {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: '#facc15',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(1, 0);

        // 4. Compact Boss HP Bar
        this._bossGroup = this.add.container(0, 168).setVisible(false);
        const bossGfx = this.add.graphics();
        drawChamferPanel(bossGfx, 0, 0, MainUIScene.BOSS_BAR_WIDTH, MainUIScene.BOSS_BAR_HEIGHT, {
            cut: 8,
            fillColor: 0x0b1324,
            fillAlpha: 0.92,
            strokeColor: 0xf43f5e,
            strokeAlpha: 0.95,
            lineWidth: 2,
        });
        this._bossBarFill = this.add.rectangle(
            -MainUIScene.BOSS_BAR_WIDTH / 2 + 4,
            0,
            MainUIScene.BOSS_BAR_WIDTH - 8,
            MainUIScene.BOSS_BAR_HEIGHT - 8,
            0xf43f5e,
            1
        ).setOrigin(0, 0.5);
        this._bossNameText = this.add.text(0, -24, 'BOSS', {
            fontSize: '19px',
            fontFamily: 'future, sans-serif',
            color: '#fda4af',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(0.5);
        this._bossGroup.add([bossGfx, this._bossBarFill, this._bossNameText]);

        // 5. Compact Tactical Radar
        this._radarFrame = this.add.graphics();
        this._radarGraphics = this.add.graphics();

        // 6. Bottom-Left Sector Indicator & Gamepad status
        const initialZone = getMapZoneForSector(1);
        this._sectorDot = this.add.circle(36, 0, 6, initialZone.borderInnerColor, 1);
        this._sectorBadgeText = this.add.text(
            52,
            0,
            `SECTEUR 1 : ${initialZone.name}`,
            {
                fontSize: '17px',
                fontFamily: 'future, sans-serif',
                color: initialZone.accentHex,
                stroke: '#020617',
                strokeThickness: 4,
            }
        ).setOrigin(0, 0.5);

        this._gamepadBadge = this.add.text(28, 0, 'MANETTE CONNECTÉE', {
            fontSize: '15px',
            fontFamily: 'future, sans-serif',
            color: '#4ade80',
            stroke: '#020617',
            strokeThickness: 3,
        }).setOrigin(0, 0.5).setVisible(false);

        this.layoutUI(this.scale.width, this.scale.height);
        this.scene.bringToTop();

        console.log("MainUIScene created");
    }

    private layoutUI(width: number, height: number) {
        const marginX = 28;
        const barW = Math.max(200, width - marginX * 2);
        if (this._expBarBg) {
            this._expBarBg.width = barW;
        }
        if (this._expBarFill) {
            this._expBarFill.width = Math.max(0, barW - 2) * this._expRatio;
        }

        const gearCx = width - 54;
        this._settingsBtn?.setPosition(gearCx, 60);
        this._scoreText?.setPosition(gearCx - 42, 34);
        this._comboText?.setPosition(gearCx - 42, 102);

        this._bossGroup?.setPosition(width / 2, 168);

        this._radarOriginX = width - MainUIScene.RADAR_SIZE - 28;
        this._radarOriginY = height - MainUIScene.RADAR_SIZE - 28;
        if (this._radarFrame) {
            this._radarFrame.clear();
            drawChamferRectTopLeft(
                this._radarFrame,
                this._radarOriginX,
                this._radarOriginY,
                MainUIScene.RADAR_SIZE,
                MainUIScene.RADAR_SIZE,
                {
                    cut: 10,
                    fillColor: 0x0b1324,
                    fillAlpha: 0.78,
                    strokeColor: 0x38bdf8,
                    strokeAlpha: 0.65,
                    lineWidth: 1.5,
                    brackets: true,
                    bracketLen: 14,
                    bracketColor: 0x7dd3fc,
                }
            );
        }
        if (this._lastRadarSnapshot) {
            this.onRadarUpdate(this._lastRadarSnapshot);
        }

        this._sectorDot?.setPosition(36, height - 34);
        this._sectorBadgeText?.setPosition(52, height - 34);
        this._gamepadBadge?.setPosition(28, height - 62);
    }

    update() {
        if (this._gamepadBadge) {
            this._gamepadBadge.setVisible(isGamepadConnected(this));
        }
    }

    private onDashChanged(status: DashStatus) {
        if (!this._dashText) return;
        if (status.isReady) {
            this._dashText.setText('● DASH PRÊT [SHIFT]').setColor('#2dd4bf');
        } else {
            const pct = Math.round(status.readyRatio * 100);
            this._dashText.setText(`○ DASH ${pct}%`).setColor('#64748b');
        }
    }

    private onOverdriveChanged(status: OverdriveStatus) {
        if (!this._overdriveText) return;
        if (status.active) {
            const sec = Math.ceil(status.remainingMs / 1000);
            this._overdriveText.setText(`★ OVERDRIVE ${sec}s !`).setColor('#fb923c');
        } else {
            this._overdriveText.setText(`★ OVERDRIVE ${Math.floor(status.value)}%`).setColor('#facc15');
        }
    }

    private onComboChanged(status: ComboStatus) {
        if (!this._comboText) return;
        if (status.count < 2) {
            this._comboText.setText('');
            return;
        }
        this._comboText.setText(`COMBO ${status.count}  x${status.multiplier}`);
    }

    private onBossStatus(status: BossStatus) {
        if (!this._bossGroup || !this._bossBarFill || !this._bossNameText) return;
        this._bossGroup.setVisible(status.active);
        if (!status.active) return;

        const ratio = status.max > 0 ? Phaser.Math.Clamp(status.current / status.max, 0, 1) : 0;
        this._bossBarFill.width = (MainUIScene.BOSS_BAR_WIDTH - 8) * ratio;
        this._bossNameText.setText(`${status.name}  •  ${Math.max(0, status.current)} / ${status.max}`);
    }

    private onBossAlert(bossName: string) {
        const cx = this.scale.width / 2;
        const cy = Math.min(340, this.scale.height * 0.34);
        const alertContainer = this.add.container(cx, cy);
        const gfx = this.add.graphics();
        drawChamferPanel(gfx, 0, 0, Math.min(780, this.scale.width - 80), 92, {
            cut: 16,
            fillColor: 0x450a0a,
            fillAlpha: 0.92,
            strokeColor: 0xf43f5e,
            strokeAlpha: 1,
            lineWidth: 2.5,
            brackets: true,
            bracketLen: 16,
            bracketColor: 0xfda4af,
        });
        const alertTxt = this.add.text(0, 0, `ALERTE BOSS : ${bossName}`, {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color: '#fecdd3',
            stroke: '#020617',
            strokeThickness: 6,
        }).setOrigin(0.5);
        alertContainer.add([gfx, alertTxt]);

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
        this._sectorDot?.setFillStyle(zone.borderInnerColor, 1);
        if (this._sectorBadgeText) {
            this._sectorBadgeText.setText(`SECTEUR ${sectorNumber} : ${zone.name}`);
            this._sectorBadgeText.setColor(zone.accentHex);
        }

        if (!isWarp) return;

        const cx = this.scale.width / 2;
        const cy = Math.min(310, this.scale.height * 0.30);
        const banner = this.add.container(cx, cy);
        const gfx = this.add.graphics();
        drawChamferPanel(gfx, 0, 0, Math.min(820, this.scale.width - 80), 116, {
            cut: 16,
            fillColor: 0x0b1324,
            fillAlpha: 0.94,
            strokeColor: zone.borderInnerColor,
            strokeAlpha: 1,
            lineWidth: 2.5,
            brackets: true,
            bracketLen: 16,
            bracketColor: zone.borderInnerColor,
        });
        const bannerTitle = this.add.text(
            0,
            -18,
            `WARP → SECTEUR ${sectorNumber} : ${zone.name}`,
            {
                fontSize: '26px',
                fontFamily: 'future, sans-serif',
                color: zone.accentHex,
                stroke: '#020617',
                strokeThickness: 6,
            }
        ).setOrigin(0.5);
        const bannerSub = this.add.text(
            0,
            22,
            `${zone.subtitle}  •  +20 HP RESTAURÉS`,
            {
                fontSize: '18px',
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
            delay: 2000,
            duration: 500,
            onComplete: () => banner.destroy(),
        });
    }

    private onRadarUpdate(snapshot: RadarSnapshot) {
        this._lastRadarSnapshot = snapshot;
        if (!this._radarGraphics) return;

        const g = this._radarGraphics;
        const size = MainUIScene.RADAR_SIZE;
        const ox = this._radarOriginX;
        const oy = this._radarOriginY;
        const rcx = ox + size / 2;
        const rcy = oy + size / 2;

        g.clear();

        g.lineStyle(1, 0x38bdf8, 0.16);
        g.strokeCircle(rcx, rcy, size * 0.22);
        g.strokeCircle(rcx, rcy, size * 0.42);
        g.lineBetween(rcx, oy + 6, rcx, oy + size - 6);
        g.lineBetween(ox + 6, rcy, ox + size - 6, rcy);

        g.fillStyle(0x4ade80, 0.95);
        for (const p of snapshot.powerUps) {
            g.fillCircle(ox + p.nx * size, oy + p.ny * size, 3);
        }

        for (const e of snapshot.enemies) {
            const ex = ox + e.nx * size;
            const ey = oy + e.ny * size;
            if (e.isBoss) {
                g.fillStyle(0xfacc15, 1);
                g.fillCircle(ex, ey, 6.5);
                g.fillStyle(0xf43f5e, 1);
                g.fillCircle(ex, ey, 4);
            } else {
                g.fillStyle(0xf43f5e, 0.95);
                g.fillCircle(ex, ey, 2.8);
            }
        }

        const px = ox + snapshot.player.nx * size;
        const py = oy + snapshot.player.ny * size;
        g.lineStyle(1.5, 0xbae6fd, 0.85);
        g.strokeCircle(px, py, 6.5);
        g.fillStyle(0x38bdf8, 1);
        g.fillCircle(px, py, 4);

        drawCornerBrackets(g, ox, oy, size, size, 10, 0x38bdf8, 0.35, 1);
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
        const innerMaxWidth = MainUIScene.HP_BAR_WIDTH - 6;
        this._hpBarFill.width = innerMaxWidth * ratio;

        if (ratio > 0.5) {
            this._hpBarFill.setFillStyle(0x22c55e);
        } else if (ratio > 0.25) {
            this._hpBarFill.setFillStyle(0xf59e0b);
        } else {
            this._hpBarFill.setFillStyle(0xef4444);
        }

        this._hpBarText.setText(`${Math.max(0, current)} / ${max} PV`);
    }

    private onExpChanged(status: ExpStatus) {
        if (!this._expBarFill || !this._levelText) return;

        this._expRatio = status.expToNext > 0 ? Phaser.Math.Clamp(status.exp / status.expToNext, 0, 1) : 0;
        const barW = this._expBarBg ? this._expBarBg.width : 1000;
        this._expBarFill.width = Math.max(0, barW - 2) * this._expRatio;

        this._levelText.setText(`LVL ${status.level}`);
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
