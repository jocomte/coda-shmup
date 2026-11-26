import { ShipBodyData } from "./ShipBodyData.ts";

export type PlayerShipsData = {
    [key: string]: PlayerShipData;
};

export type PlayerShipData = {
    name?: string;
    description?: string;
    movementSpeed: number;
    maxHealth?: number;
    rateOfFire?: number;
    baseDamage?: number;
    dashCooldownMs?: number;
    texture: string;
    body: ShipBodyData;
};
