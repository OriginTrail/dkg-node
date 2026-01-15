-- Create publisher_test table for tracking test metrics
CREATE TABLE IF NOT EXISTS publisher_test (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    blockchain VARCHAR(50) NOT NULL,
    publish_success_rate DECIMAL(5,2) NOT NULL COMMENT 'Success rate as percentage (0-100)',
    avg_publish_time DECIMAL(10,2) NOT NULL COMMENT 'Average publish time in seconds',
    INDEX idx_timestamp (timestamp),
    INDEX idx_blockchain (blockchain),
    INDEX idx_timestamp_blockchain (timestamp, blockchain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Publisher plugin test metrics for Grafana dashboards';

-- Create publisher_test_errors table for tracking errors
CREATE TABLE IF NOT EXISTS publisher_test_errors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    blockchain VARCHAR(50) NOT NULL,
    error TEXT NOT NULL,
    INDEX idx_timestamp (timestamp),
    INDEX idx_blockchain (blockchain),
    INDEX idx_timestamp_blockchain (timestamp, blockchain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Publisher plugin test errors for Grafana dashboards';
