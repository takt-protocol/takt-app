package main

import (
	"fmt"
	"strings"
)

type SimulateResultItem struct {
	XDR  string   `json:"xdr,omitempty"`
	Auth []string `json:"auth,omitempty"`
}

type SimulateTransactionResponse struct {
	Error        string               `json:"error,omitempty"`
	Results      []SimulateResultItem `json:"results,omitempty"`
	LatestLedger uint64               `json:"latestLedger,omitempty"`
}

type SendTransactionResponse struct {
	Hash   string `json:"hash"`
	Status string `json:"status"`
}

// SimulateExecuteJob pre-simulates an execute_job transaction on Soroban RPC
// and returns an error if the target invocation reverts with a HostError or
// Error(Contract, #...) or yields no execution result.
func (c *RPCClient) SimulateExecuteJob(jobID uint64, txXDR string) (*SimulateTransactionResponse, error) {
	if strings.TrimSpace(txXDR) == "" {
		txXDR = fmt.Sprintf("simulate:execute_job:%d", jobID)
	}

	var simResp SimulateTransactionResponse
	err := c.Call("simulateTransaction", map[string]interface{}{
		"transaction": txXDR,
	}, &simResp)
	if err != nil {
		return nil, fmt.Errorf("simulateTransaction rpc call failed for job %d: %w", jobID, err)
	}

	if strings.TrimSpace(simResp.Error) != "" {
		return &simResp, fmt.Errorf("simulation reverted for job %d: %s", jobID, simResp.Error)
	}

	if len(simResp.Results) == 0 {
		return &simResp, fmt.Errorf("simulation returned empty results for job %d", jobID)
	}

	return &simResp, nil
}

// ExecuteJob broadcasts the execute_job transaction to Soroban RPC after pre-simulation passes.
func (c *RPCClient) ExecuteJob(jobID uint64, txXDR string) (*SendTransactionResponse, error) {
	if strings.TrimSpace(txXDR) == "" {
		txXDR = fmt.Sprintf("execute:execute_job:%d", jobID)
	}

	var sendResp SendTransactionResponse
	err := c.Call("sendTransaction", map[string]interface{}{
		"transaction": txXDR,
	}, &sendResp)
	if err != nil {
		return nil, fmt.Errorf("sendTransaction failed for job %d: %w", jobID, err)
	}

	if sendResp.Status == "ERROR" {
		return &sendResp, fmt.Errorf("sendTransaction rejected for job %d", jobID)
	}

	return &sendResp, nil
}
