package main

type JobStatus string

const (
	StatusActive    JobStatus = "Active"
	StatusPaused    JobStatus = "Paused"
	StatusCancelled JobStatus = "Cancelled"
	StatusCompleted JobStatus = "Completed"
)

type Job struct {
	ID              uint64    `json:"id"`
	Owner           string    `json:"owner"`
	TargetContract  string    `json:"target_contract"`
	TargetFn        string    `json:"target_fn"`
	IntervalSeconds uint64    `json:"interval_seconds"`
	LastExecutedAt  uint64    `json:"last_executed_at"`
	BountyPerRun    int64     `json:"bounty_per_run"`
	MaxRuns         uint32    `json:"max_runs"`
	CompletedRuns   uint32    `json:"completed_runs"`
	Status          JobStatus `json:"status"`
	CreatedAt       uint64    `json:"created_at"`
}

type ExecutionReceipt struct {
	JobID        uint64 `json:"job_id"`
	Keeper       string `json:"keeper"`
	ExecutedAt   uint64 `json:"executed_at"`
	RunNumber    uint32 `json:"run_number"`
	KeeperReward int64  `json:"keeper_reward"`
	ProtocolFee  int64  `json:"protocol_fee"`
}

type KeeperInfo struct {
	Address          string `json:"address"`
	StakedAmount     int64  `json:"staked_amount"`
	Status           string `json:"status"`
	RegisteredAt     uint64 `json:"registered_at"`
	UnbondUnlockTime uint64 `json:"unbond_unlock_time"`
	TotalExecutions  uint64 `json:"total_executions"`
	Slashes          uint32 `json:"slashes"`
}
