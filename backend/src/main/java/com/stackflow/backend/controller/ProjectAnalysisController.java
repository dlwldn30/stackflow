package com.stackflow.backend.controller;

import com.stackflow.backend.dto.ApiCatalogItemResponse;
import com.stackflow.backend.dto.ProjectAnalyzeRequest;
import com.stackflow.backend.dto.ProjectFolderSelectionResponse;
import com.stackflow.backend.dto.ProjectStructureResponse;
import com.stackflow.backend.dto.WorkspaceAnalysisResponse;
import com.stackflow.backend.dto.WorkspaceAnalyzeRequest;
import com.stackflow.backend.service.LocalProjectFolderPickerService;
import com.stackflow.backend.service.SpringApiCatalogService;
import com.stackflow.backend.service.SpringWorkspaceService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/project")
public class ProjectAnalysisController {

	private final SpringApiCatalogService springApiCatalogService;
	private final LocalProjectFolderPickerService localProjectFolderPickerService;
	private final SpringWorkspaceService springWorkspaceService;

	public ProjectAnalysisController(
		SpringApiCatalogService springApiCatalogService,
		LocalProjectFolderPickerService localProjectFolderPickerService,
		SpringWorkspaceService springWorkspaceService
	) {
		this.springApiCatalogService = springApiCatalogService;
		this.localProjectFolderPickerService = localProjectFolderPickerService;
		this.springWorkspaceService = springWorkspaceService;
	}

	@GetMapping("/apis")
	public List<ApiCatalogItemResponse> getApiCatalog() {
		return springApiCatalogService.getApiCatalog();
	}

	@GetMapping("/structure")
	public ProjectStructureResponse getProjectStructure() {
		return springApiCatalogService.getProjectStructure();
	}

	@PostMapping("/structure/analyze")
	public ProjectStructureResponse analyzeProjectStructure(@RequestBody ProjectAnalyzeRequest request) {
		return springApiCatalogService.getProjectStructure(request.projectPath());
	}

	@PostMapping("/workspace/analyze")
	public WorkspaceAnalysisResponse analyzeWorkspace(@RequestBody WorkspaceAnalyzeRequest request) {
		return springWorkspaceService.analyze(request.workspacePath());
	}

	@PostMapping("/folder/select")
	public ProjectFolderSelectionResponse selectProjectFolder() {
		return localProjectFolderPickerService.selectProjectFolder();
	}
}
