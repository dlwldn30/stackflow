package com.stackflow.backend.controller;

import com.stackflow.backend.dto.ApiCatalogItemResponse;
import com.stackflow.backend.dto.ProjectAnalyzeRequest;
import com.stackflow.backend.dto.ProjectStructureResponse;
import com.stackflow.backend.service.SpringApiCatalogService;
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

	public ProjectAnalysisController(SpringApiCatalogService springApiCatalogService) {
		this.springApiCatalogService = springApiCatalogService;
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
}
