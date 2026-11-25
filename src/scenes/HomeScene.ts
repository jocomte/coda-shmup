import {Loader} from "phaser";
import GameConstants from "../GameConstants.ts";

export default class HomeScene extends Phaser.Scene {
    constructor() {
        super(GameConstants.SceneKeys.HOME);
    }

    preload() {
        const width: number = this.scale.width;
        const y: number = this.scale.height / 2;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(0, y, width, 64);
        this.load.on(Loader.Events.PROGRESS, function (value: number) { // 0-1
            console.log("Loading : " + value);

            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(0, y, width * value, 64);
        });
        this.load.on(Loader.Events.COMPLETE, function () {
            console.log("Loading complete");

            progressBar.destroy();
            progressBox.destroy();
        });

        this.load.setPath('assets');

        this.load.image('bg', 'Backgrounds/darkPurple.png');
        this.load.image('planet', 'Planets/planet00.png');
        this.load.atlas('sprites', 'Spritesheet/gameSprites.png', 'Spritesheet/gameSprites.json');
        this.load.bitmapFont('future-bmp', 'Fonts/kenvector_future.png', 'Fonts/kenvector_future.xml');
        this.load.font('future', 'Fonts/kenvector_future.ttf');
        this.load.json('playerShips', 'Data/playerShips.json');
        this.load.json('enemies', 'Data/enemies.json');
        this.load.audio('sfx_laser1', 'Sounds/sfx_laser1.ogg');
        this.load.audio('sfx_laser2', 'Sounds/sfx_laser2.ogg');
    }

    create() {
        this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2)
            .setAlpha(0.75);

        for (let i = 0; i < 60; i++) {
            this.add.circle(
                Phaser.Math.Between(10, this.scale.width - 10),
                Phaser.Math.Between(10, this.scale.height - 10),
                Phaser.Math.FloatBetween(1, 2.8),
                0xbae6fd,
                Phaser.Math.FloatBetween(0.25, 0.85)
            );
        }

        const previewShip = this.add.image(this.scale.width / 2, this.scale.height * 0.42, 'sprites', 'playerShip1_blue')
            .setRotation(-Math.PI / 2)
            .setScale(1.8);
        this.tweens.add({
            targets: previewShip,
            y: previewShip.y - 18,
            duration: 1400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        this.add.text(this.scale.width / 2, this.scale.height * 0.25, 'CODA HERO SHOOTER',
            {fontSize: '64px', color: '#38bdf8', fontFamily: 'future', stroke: '#000000', strokeThickness: 6}).setOrigin(0.5);
        this.add.text(this.scale.width / 2, this.scale.height * 0.56, 'Move: Arrows / ZQSD / WASD  •  Auto-Shoot\nCollect EXP Gems to Level Up & Upgrade!',
            {fontSize: '28px', color: '#cbd5e1', align: 'center', lineSpacing: 12}).setOrigin(0.5);
        this.add.text(this.scale.width / 2, this.scale.height * 0.70, 'Press SPACE to start',
            {fontSize: '38px', color: '#fde047', fontFamily: 'future'}).setOrigin(0.5);

        // Ignore the OS key repeat: SPACE may still be held from the previous game
        this.input.keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => {
            if (event.repeat)
                return;

            this.scene.launch(GameConstants.SceneKeys.MAIN_UI);
            this.scene.start(GameConstants.SceneKeys.MAIN_GAME);
        });

        console.log("HomeScene created");
    }
}