-- SSE Drone Management System - Database Schema

USE sse;

CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(64) NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('super_admin', 'admin', 'user') NOT NULL DEFAULT 'user',
    status          ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    is_protected    TINYINT(1) NOT NULL DEFAULT 0,
    force_pw_change TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_profiles (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at    DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drones (
    drone_id     VARCHAR(64) NOT NULL PRIMARY KEY,
    display_name VARCHAR(128) NOT NULL,
    drone_token  VARCHAR(255) NOT NULL,
    is_connected TINYINT(1) NOT NULL DEFAULT 0,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    is_locked    TINYINT(1) NOT NULL DEFAULT 0,
    last_seen_at DATETIME DEFAULT NULL,
    created_by   INT UNSIGNED DEFAULT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_drones_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drone_user_access (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    drone_id     VARCHAR(64) NOT NULL,
    user_id      INT UNSIGNED NOT NULL,
    access_level ENUM('read', 'control') NOT NULL DEFAULT 'read',
    granted_by   INT UNSIGNED DEFAULT NULL,
    granted_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_drone_user (drone_id, user_id),
    CONSTRAINT fk_dua_drone FOREIGN KEY (drone_id) REFERENCES drones(drone_id) ON DELETE CASCADE,
    CONSTRAINT fk_dua_user  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drone_control_parameters (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    drone_id   VARCHAR(64) NOT NULL UNIQUE,
    source     VARCHAR(32) NOT NULL DEFAULT 'default',
    kp_ar DOUBLE NOT NULL DEFAULT 0, ki_ar DOUBLE NOT NULL DEFAULT 0, kd_ar DOUBLE NOT NULL DEFAULT 0,
    kp_ap DOUBLE NOT NULL DEFAULT 0, ki_ap DOUBLE NOT NULL DEFAULT 0, kd_ap DOUBLE NOT NULL DEFAULT 0,
    kp_rr DOUBLE NOT NULL DEFAULT 0, ki_rr DOUBLE NOT NULL DEFAULT 0, kd_rr DOUBLE NOT NULL DEFAULT 0,
    kp_rp DOUBLE NOT NULL DEFAULT 0, ki_rp DOUBLE NOT NULL DEFAULT 0, kd_rp DOUBLE NOT NULL DEFAULT 0,
    kp_ry DOUBLE NOT NULL DEFAULT 0, ki_ry DOUBLE NOT NULL DEFAULT 0, kd_ry DOUBLE NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dcp_drone FOREIGN KEY (drone_id) REFERENCES drones(drone_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS telemetry (
    id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    drone_id               VARCHAR(64) NOT NULL,
    received_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    is_valid               TINYINT(1) NOT NULL DEFAULT 1,
    tick                   BIGINT UNSIGNED DEFAULT NULL,
    roll_angle_estimate    DOUBLE DEFAULT NULL,
    pitch_angle_estimate   DOUBLE DEFAULT NULL,
    yaw_rate_setpoint      DOUBLE DEFAULT NULL,
    altitude_estimate      DOUBLE DEFAULT NULL,
    INDEX idx_telemetry_drone (drone_id),
    CONSTRAINT fk_telemetry_drone FOREIGN KEY (drone_id) REFERENCES drones(drone_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS step_runs (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    drone_id   VARCHAR(64) NOT NULL,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_step_runs_drone (drone_id),
    CONSTRAINT fk_step_runs_drone FOREIGN KEY (drone_id) REFERENCES drones(drone_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
