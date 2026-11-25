import { Input, Scene } from "phaser";
import GameConstants from "../GameConstants.ts";
import Player from "../entities/Player.ts";
import type { UpgradeDefinition } from "../gameData/UpgradeData.ts";

type LevelUpData = {
    player: Player;
};

export default class LevelUpScene extends Scene {
    private _player!: Player;
    private _choices: UpgradeDefinition[] = [];
    private _inputReady: boolean = false;
    private _selectionMade: boolean = false;

    constructor() {
        super(GameConstants.SceneKeys.LEVEL_UP);
    }

    create(data: LevelUpData) {
        this._player = data.player;
        this._choices = this._player.getUpgradeChoices(3);
        this._inputReady = false;
        this._selectionMade = false;

        if (this._choices.length === 0) {
            this.finishSelection();
            return;
        }

        const width = this.scale.width;
        const height = this.scale.height;

        // Dimmed backdrop
        this.add.rectangle(0, 0, width, height, 0x050816, 0.78).setOrigin(0, 0);

        // Title & Subtitle
        this.add.text(width / 2, 240, `NIVEAU ${this._player.level} !`, {
            fontSize: '72px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
            stroke: '#000000',
            strokeThickness: 8,
        }).setOrigin(0.5);

        this.add.text(width / 2, 325, 'CHOISISSEZ UNE AMÉLIORATION DU VAISSEAU', {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);

        // Render 3 interactive upgrade cards
        const cardWidth = 860;
        const cardHeight = 270;
        const startY = 560;
        const spacing = 320;

        this._choices.forEach((choice, index) => {
            const cardY = startY + index * spacing;
            this.createUpgradeCard(width / 2, cardY, cardWidth, cardHeight, choice, index);
        });

        this.add.text(width / 2, startY + 3 * spacing - 30, 'Cliquez ou appuyez sur [1] [2] [3]', {
            fontSize: '26px',
            color: '#94a3b8',
        }).setOrigin(0.5);

        // Small delay so held movement/action keys don't immediately pick an upgrade
        this.time.delayedCall(350, () => {
            this._inputReady = true;
        });

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (!this._inputReady || this._selectionMade) return;

            if (event.keyCode === Input.Keyboard.KeyCodes.ONE && this._choices[0]) {
                this.selectUpgrade(this._choices[0]);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.TWO && this._choices[1]) {
                this.selectUpgrade(this._choices[1]);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.THREE && this._choices[2]) {
                this.selectUpgrade(this._choices[2]);
            }
        });

        this.scene.bringToTop();
    }

    private createUpgradeCard(
        cx: number,
        cy: number,
        w: number,
        h: number,
        choice: UpgradeDefinition,
        index: number
    ) {
        const container = this.add.container(cx, cy);
        const accentHex = Number(choice.accentColor.replace('#', '0x'));

        const bg = this.add.rectangle(0, 0, w, h, 0x0f172a, 0.96)
            .setStrokeStyle(4, accentHex, 0.9)
            .setInteractive({ useHandCursor: true });

        const iconBg = this.add.rectangle(-w / 2 + 125, 0, 148, 148, 0x1e293b, 1)
            .setStrokeStyle(3, accentHex, 0.7);
        const icon = this.add.image(-w / 2 + 125, 0, 'sprites', choice.iconFrame)
            .setScale(1.85);

        const currentRank = this._player.getUpgradeRank(choice.id);
        const rankLabel = choice.maxRank > 0
            ? `RANG ${currentRank} -> ${currentRank + 1}`
            : 'BONUS IMMÉDIAT';

        const titleText = this.add.text(-w / 2 + 230, -68, choice.title, {
            fontSize: '36px',
            fontFamily: 'future, sans-serif',
            color: choice.accentColor,
        }).setOrigin(0, 0.5);

        const rankText = this.add.text(w / 2 - 36, -68, `[${index + 1}]  ${rankLabel}`, {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: '#cbd5e1',
        }).setOrigin(1, 0.5);

        const descText = this.add.text(-w / 2 + 230, 18, choice.description, {
            fontSize: '28px',
            color: '#f8fafc',
            lineSpacing: 10,
        }).setOrigin(0, 0.5);

        container.add([bg, iconBg, icon, titleText, rankText, descText]);

        bg.on('pointerover', () => {
            bg.setFillStyle(0x1e293b, 1);
            container.setScale(1.03);
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(0x0f172a, 0.96);
            container.setScale(1);
        });

        bg.on('pointerdown', () => {
            if (!this._inputReady || this._selectionMade) return;
            this.selectUpgrade(choice);
        });
    }

    private selectUpgrade(choice: UpgradeDefinition) {
        this._selectionMade = true;
        this._player.applyUpgrade(choice.id);
        this.finishSelection();
    }

    private finishSelection() {
        this.scene.stop();
        if (this._player.hasPendingLevelUps()) {
            this._player.triggerNextLevelUp();
        } else {
            this.scene.resume(GameConstants.SceneKeys.MAIN_GAME);
        }
    }
}
