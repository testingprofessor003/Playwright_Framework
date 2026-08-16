@login @smoke
Feature: Core banking login
  As a banking user
  I want to sign in with my email and password
  So that I can access the application

  Scenario: Sign in with valid credentials
    Given I launch the core banking application
    When I sign in with valid credentials
    Then I should be logged into the application
